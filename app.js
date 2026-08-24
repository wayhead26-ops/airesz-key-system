const config = window.AIRESZ_CONFIG;
const AIRESZ_SCRIPT_LOADER_URL = config.scriptLoaderUrl || `${location.origin}${location.pathname.replace(/\/$/, "")}/loader.lua`;
const planSteps = Object.freeze({ "24H": 1, "48H": 2, "72H": 3 });
const commerceState = { products: {}, loaded: false };
const gamesState = { items: [], filter: "all", query: "" };
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
    expiresAt: keyData.expiresAt == null ? null : Number(keyData.expiresAt),
    premium: Boolean(keyData.premium)
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
  if (item.expiresAt != null && Number(item.expiresAt) - now <= 43200) return ["Expiring Soon", "expiring"];
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

function formatResetCooldown(seconds) {
  let value = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(value / 3600);
  value %= 3600;
  const minutes = Math.ceil(value / 60);
  if (hours > 0) return `${hours}h ${Math.min(59, minutes)}m`;
  return `${Math.max(1, minutes)}m`;
}

function renderKeyHistoryCard(item) {
  const [label, cls] = keyStateLabel(item);
  const keyText = item.key || maskKey(item.prefix);
  const canCopy = Boolean(item.key);
  const isActiveKey = cls === "active" || cls === "expiring";
  const selfResetEligible = item.selfHwidResetEligible === true;
  const unlimitedResets = selfResetEligible && item.maxResets == null;
  const remainingResets = unlimitedResets
    ? null
    : (item.resetsRemaining == null ? null : Math.max(0, Number(item.resetsRemaining)));
  const retryAfter = Math.max(0, Number(item.resetRetryAfter || 0));
  const hasResetAllowance = unlimitedResets || (remainingResets != null && remainingResets > 0);
  const canResetNow = isActiveKey && selfResetEligible && hasResetAllowance && retryAfter <= 0;
  const resetButton = selfResetEligible && isActiveKey
    ? canResetNow
      ? `<button class="key-history-reset" type="button" data-reset-hwid data-key-id="${escapeHtml(item.id || "")}">↻ Reset HWID</button>`
      : retryAfter > 0
        ? `<button class="key-history-reset" type="button" disabled>↻ Cooldown ${escapeHtml(formatResetCooldown(retryAfter))}</button>`
        : `<button class="key-history-reset" type="button" disabled>↻ Reset Limit Reached</button>`
    : "";
  const action = item.state === "deleted"
    ? '<span class="key-history-note">This key was deleted and is no longer active.</span>'
    : item.state === "hwid_mismatch"
    ? '<span class="key-history-note">Get a new key to continue.</span>'
    : canCopy
      ? `<div class="key-history-action-group"><button class="key-history-copy" type="button" data-key="${encodeURIComponent(item.key)}">Copy Key</button>${resetButton}</div>`
      : '<span class="key-history-note">Enter the key below to recover.</span>';

  const resetMeta = !selfResetEligible
    ? ""
    : unlimitedResets
      ? `<span>HWID Reset: Unlimited · 6h cooldown</span>`
      : `<span>HWID Reset: ${remainingResets == null ? "—" : remainingResets} remaining · 6h cooldown</span>`;
  const keyTitle = item.source === "giveaway" ? "Giveaway Key" : item.plan ? `${item.plan} Key` : "Airesz Key";
  return `<article class="key-history-card ${cls} ${item.source === "giveaway" ? "giveaway" : ""}">
    <div class="key-history-top"><div><span class="key-state-pill ${cls}">${label}</span>${item.premium ? '<span class="premium-chip">💎 PREMIUM</span>' : ""}<strong>${keyTitle}</strong></div><span class="key-history-time">${item.expiresAt == null ? "Lifetime" : remainingText(item.expiresAt)}</span></div>
    <code>${canCopy ? escapeHtml(item.key) : escapeHtml(keyText || "Unknown key")}</code>
    <div class="key-history-meta"><span>Issued ${item.issuedAt ? new Date(Number(item.issuedAt) * 1000).toLocaleString() : "—"}</span><span>${item.expiresAt == null ? "No expiry" : `Expires ${new Date(Number(item.expiresAt) * 1000).toLocaleString()}`}</span>${resetMeta}</div>
    <div class="key-history-actions">${action}</div>
  </article>`;
}

function bindKeyCopyButtons(root = document) {
  root.querySelectorAll(".key-history-copy").forEach(button => button.addEventListener("click", async () => {
    const copied = await copyText(decodeURIComponent(button.dataset.key || ""));
    if (copied) {
      button.textContent = "Copied ✓";
      showToast("Key copied ✓", true);
      setTimeout(() => { button.textContent = "Copy Key"; }, 1200);
    } else {
      showToast("Clipboard permission was blocked.", false);
      setMessage("Clipboard permission was blocked.");
    }
  }));
}

function bindHwidResetButtons(root = document) {
  root.querySelectorAll("[data-reset-hwid]").forEach(button => {
    button.addEventListener("click", () => resetHwidFromWebsite(button, button.dataset.keyId || ""));
  });
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
  bindHwidResetButtons(target);
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


async function loadGlobalMaintenanceStatus() {
  try {
    const data = await api("/api/status");
    const pill = $("#globalMaintenancePill");
    const banner = $("#maintenanceBanner");
    const bannerMessage = $("#maintenanceBannerMessage");
    const maintenance = data.status === "maintenance" || data.status === "major_outage";
    if (pill) {
      pill.classList.toggle("is-maintenance", maintenance);
      pill.innerHTML = `<span class="status-dot"></span> ${maintenance ? "Maintenance" : "All Systems Online"}`;
    }
    if (banner) {
      banner.classList.toggle("hidden", !maintenance);
      if (maintenance && bannerMessage) bannerMessage.textContent = data.message || "Existing key time is paused and will resume automatically when service is restored.";
    }
  } catch (error) {
    console.warn("Public status unavailable", error);
  }
}

async function loadCommerceConfig() {
  try {
    const data = await api("/api/commerce/config");
    Object.assign(commerceState.products, data.products || {});
    commerceState.loaded = true;

    const premium = commerceState.products.premium || {};
    const bundle = commerceState.products.bundle || {};

    const premiumPriceText = premium.amountCents
      ? `${(premium.amountCents / 100).toFixed(2).replace(/\.00$/, "")} ${String(premium.currency || "usd").toUpperCase()}`
      : "";

    [$("#buyPremiumBtn"), $("#pricingPremiumBtn")].filter(Boolean).forEach((button) => {
      const available = Boolean(premium.available);
      button.disabled = !available;
      button.classList.toggle("is-ready", available);
      const small = button.querySelector("small");
      if (small) small.textContent = available ? premiumPriceText : "Coming soon";
      if (button.id === "pricingPremiumBtn") {
        button.textContent = available
          ? `💎 Upgrade to Premium · ${premiumPriceText}`
          : "💎 Premium Upgrade · Coming soon";
      }
    });

    const premiumPrice = $("#premiumPrice");
    if (premiumPrice) {
      premiumPrice.innerHTML = premium.available && premium.amountCents
        ? `$${(premium.amountCents / 100).toFixed(2).replace(/\.00$/, "")} <small>${String(premium.currency || "usd").toUpperCase()}</small>`
        : "Coming Soon";
    }

    const bundlePriceText = bundle.amountCents
      ? `${(bundle.amountCents / 100).toFixed(2).replace(/\.00$/, "")} ${String(bundle.currency || "usd").toUpperCase()}`
      : "7.99 USD";

    $$('button[data-product="BUNDLE"]').forEach((button) => {
      const available = bundle.available !== false;
      button.disabled = !available;
      button.classList.toggle("is-ready", available);
      if (available) {
        button.textContent = `✨ Lifetime + Premium · ${bundlePriceText}`;
      } else {
        button.textContent = "✨ Lifetime + Premium · Coming soon";
      }
    });
  } catch (error) {
    console.warn("Commerce config unavailable", error);
  }
}

async function loadGames() {
  const target = $("#gamesGrid");
  if (!target) return;
  try {
    const data = await api("/api/games");
    gamesState.items = Array.isArray(data.games) ? data.games : [];
    renderGames();
  } catch (error) {
    target.innerHTML = `<div class="game-loading error-state">Unable to load games right now.<br><small>${escapeHtml(error?.message || "Unknown error")}</small></div>`;
    console.warn("Games load failed", error);
  }
}

function gameMatches(item) {
  const q = gamesState.query.trim().toLowerCase();
  const status = item.maintenance ? "maintenance" : "online";
  if (gamesState.filter !== "all" && gamesState.filter !== status) return false;
  return !q || `${item.name} ${item.gameId || ""} ${item.version || ""}`.toLowerCase().includes(q);
}

function getGamePlaceId(game) {
  return String(
    game?.thumbnailPlaceId
    || game?.placeId
    || game?.placeIds?.[0]
    || game?.gameId
    || ""
  ).trim();
}

function getGameLoadstring() {
  return `loadstring(game:HttpGet("https://pastebin.com/raw/ehQa2Qj1"))()`;
}

async function copySiteLoadstring(button = null) {
  const loadstring = getGameLoadstring();
  const copied = await copyText(loadstring);
  if (copied) {
    if (button) {
      button.textContent = "Copied ✓";
      setTimeout(() => { button.textContent = "Get Script"; }, 1600);
    }
    showToast("Airesz loadstring copied ✓", true);
    setMessage("Airesz loadstring copied.", true);
    return true;
  }
  showToast("Clipboard permission was blocked.", false);
  setMessage("Clipboard permission was blocked.");
  return false;
}

const robloxThumbnailCache = new Map();
const GAME_THUMBNAIL_FALLBACK = "assets/airesz-mark.png";

function applyGameThumbnailFallback(node) {
  if (!node) return;
  node.onerror = null;
  node.src = GAME_THUMBNAIL_FALLBACK;
  node.dataset.robloxResolved = "fallback";
}

async function getRobloxPlaceIcon(placeId) {
  const id = String(placeId || "").trim();
  if (!/^\d+$/.test(id)) return null;
  const cacheKey = `experience:${id}`;
  if (robloxThumbnailCache.has(cacheKey)) return robloxThumbnailCache.get(cacheKey);

  try {
    const data = await api(`/api/games/thumbnail?placeId=${encodeURIComponent(id)}&kind=experience`);
    const image = typeof data?.imageUrl === "string" && /^https:\/\//i.test(data.imageUrl)
      ? data.imageUrl
      : null;
    robloxThumbnailCache.set(cacheKey, image);
    return image;
  } catch (error) {
    console.warn("Experience thumbnail proxy unavailable", id, error?.message || error);
    robloxThumbnailCache.set(cacheKey, null);
    return null;
  }
}

async function hydrateGameThumbnails() {
  const nodes = [...document.querySelectorAll("[data-place-thumb]")];
  await Promise.all(nodes.map(async (node) => {
    const placeId = node.dataset.placeThumb || "";
    node.onerror = () => applyGameThumbnailFallback(node);
    const image = await getRobloxPlaceIcon(placeId);
    if (image) {
      node.src = image;
      node.dataset.robloxResolved = "true";
    } else {
      applyGameThumbnailFallback(node);
    }
  }));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function openGameModal(game) {
  const modal = $("#gameModal");
  if (!modal || !game) return;
  const status = game.maintenance ? "Maintenance" : "Online";
  const statusClass = game.maintenance ? "maintenance" : "online";
  const placeId = getGamePlaceId(game);
  const icon = game.iconUrl || "assets/airesz-mark.png";
  const features = Array.isArray(game.features) && game.features.length
    ? game.features.slice(0, 10)
    : ["Game Script", "HWID Protected", "Cloud Verified", "Regular Updates"];
  const premiumFeatures = Array.isArray(game.premiumFeatures)
    ? game.premiumFeatures.filter(Boolean).slice(0, 8)
    : [];
  const premiumAvailable = game.premiumAvailable === true || premiumFeatures.length > 0;
  const premiumColumn = premiumAvailable
    ? `<div class="feature-column premium-column">
        <h3>💎 ${escapeHtml(game.premiumLabel || "Premium Features")}</h3>
        ${premiumFeatures.map((feature) => `<span>💎 ${escapeHtml(feature)}</span>`).join("")}
        ${game.premiumMore ? '<small class="premium-modal-more">+ more Premium features available in-game</small>' : ""}
      </div>`
    : "";
  modal.dataset.gameName = game.name || "Game";
  modal.dataset.placeId = getGamePlaceId(game);
  modal.dataset.gameJson = JSON.stringify(game);
  const modalImage = $("#gameModalImage");
  modalImage.src = icon;
  modalImage.dataset.placeThumb = placeId;
  modalImage.alt = `${game.name || "Game"} thumbnail`;
  modalImage.onerror = () => applyGameThumbnailFallback(modalImage);
  void getRobloxPlaceIcon(placeId).then((image) => {
    if (image) modalImage.src = image;
    else applyGameThumbnailFallback(modalImage);
  });
  $("#gameModalTitle").textContent = game.name || "Game";
  $("#gameModalVersion").textContent = game.version ? `v${game.version}` : "Ready";
  $("#gameModalDescription").textContent = game.maintenance
    ? (game.maintenanceMessage || "This game is currently under maintenance.")
    : premiumAvailable
      ? "Airesz script ready for this game with Standard access and additional Premium features."
      : "Airesz script ready for this game with cloud verification and automatic updates.";
  const statusNode = $("#gameModalStatus");
  statusNode.className = `game-status ${statusClass}`;
  statusNode.innerHTML = `<i></i>${status}`;
  $("#gameModalFeatures").innerHTML = `
    <div class="feature-column"><h3>Standard Features</h3>${features.map((feature) => `<span>✓ ${escapeHtml(feature)}</span>`).join("")}</div>
    ${premiumColumn}`;
  $("#gameModalNotice").textContent = "";
  const scriptBtn = $("#gameModalScriptBtn");
  scriptBtn.disabled = Boolean(game.maintenance);
  scriptBtn.textContent = game.maintenance ? "Script Unavailable" : "Copy Get Script";
  const keyBtn = $("#gameModalKeyBtn");
  keyBtn.disabled = Boolean(game.maintenance);
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeGameModal() {
  const modal = $("#gameModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

async function copyGameScript(game, sourceButton) {
  if (!game || game.maintenance) return false;
  const loadstring = getGameLoadstring();
  const copied = await copyText(loadstring);
  if (copied) {
    if (sourceButton) {
      sourceButton.textContent = "Copied ✓";
      setTimeout(() => { sourceButton.textContent = "Get Script"; }, 1600);
    }
    showToast(`${game.name} loadstring copied ✓`, true);
    setMessage(`${game.name} loadstring copied.`, true);
    return true;
  }
  showToast("Clipboard permission was blocked.", false);
  setMessage("Clipboard permission was blocked.");
  return false;
}

function scrollToGameKey(gameName) {
  const target = $("#get-key");
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => {
    setMessage(`Selected ${gameName}. Choose a key route below.`, true);
  }, 350);
}

function renderGames() {
  const target = $("#gamesGrid");
  if (!target) return;
  const items = gamesState.items.filter(gameMatches);
  if (!items.length) { target.innerHTML = '<div class="game-loading">No supported games match your search.</div>'; return; }
  target.innerHTML = items.map((game, index) => {
    const status = game.maintenance ? "Maintenance" : "Online";
    const statusClass = game.maintenance ? "maintenance" : "online";
    const icon = game.iconUrl || "assets/airesz-mark.png";
    const version = game.version ? `v${escapeHtml(game.version)}` : "Ready";
    const placeId = getGamePlaceId(game);
    const standardFeatures = Array.isArray(game.features) && game.features.length
      ? game.features.slice(0, 3)
      : ["Game Script", "HWID Protected", "Cloud Verified"];
    const premiumFeatures = Array.isArray(game.premiumFeatures)
      ? game.premiumFeatures.filter(Boolean)
      : [];
    const premiumAvailable = game.premiumAvailable === true || premiumFeatures.length > 0;
    const premiumHighlights = premiumFeatures.slice(0, 4);
    const premiumBanner = premiumAvailable
      ? `<div class="game-premium-banner">
          <div class="game-premium-heading"><span>💎</span><div><strong>${escapeHtml(game.premiumLabel || "PREMIUM AVAILABLE")}</strong><small>Extra intelligence and automation tools</small></div></div>
          <div class="game-premium-highlights">${premiumHighlights.map((feature) => `<span>${escapeHtml(feature)}</span>`).join("")}</div>
          ${(game.premiumMore || premiumFeatures.length > premiumHighlights.length) ? '<div class="game-premium-more">+ more Premium features</div>' : ""}
        </div>`
      : "";
    const gameId = `game-${index}`;
    const payload = encodeURIComponent(JSON.stringify(game));
    return `<article class="game-card ${premiumAvailable ? "has-premium" : ""}" data-game-id="${gameId}">
      <button class="game-cover-button" type="button" data-game-view="${payload}" aria-label="View ${escapeHtml(game.name)}">
        <div class="game-cover"><img src="${escapeHtml(icon)}" data-place-thumb="${escapeHtml(placeId)}" alt="${escapeHtml(game.name)} thumbnail" loading="lazy"><span class="game-status ${statusClass}"><i></i>${status}</span>${premiumAvailable ? '<span class="game-premium-cover-badge">💎 PREMIUM</span>' : ""}</div>
      </button>
      <div class="game-card-body"><div class="game-card-title"><div><span class="game-place">Roblox Game</span><h3>${escapeHtml(game.name)}</h3></div><span class="game-version">${version}</span></div>
      <div class="game-feature-list">${standardFeatures.map((feature) => `<span>✓ ${escapeHtml(feature)}</span>`).join("")}</div>
      ${premiumBanner}
      <div class="game-card-actions">
        <button class="game-view-button game-script-button" type="button" data-game-script="${payload}" ${game.maintenance ? "disabled" : ""}>Get Script <span>↗</span></button>
        <button class="game-key-button" type="button" data-game-key="${payload}" ${game.maintenance ? "disabled" : ""}>Get Key</button>
      </div></div>
    </article>`;
  }).join("");
  void hydrateGameThumbnails();

  target.querySelectorAll("[data-game-view]").forEach((node) => node.addEventListener("click", () => {
    try { openGameModal(JSON.parse(decodeURIComponent(node.dataset.gameView))); } catch {}
  }));
  target.querySelectorAll("[data-game-script]").forEach((node) => node.addEventListener("click", async (event) => {
    event.stopPropagation();
    try { await copyGameScript(JSON.parse(decodeURIComponent(node.dataset.gameScript)), node); } catch {}
  }));
  target.querySelectorAll("[data-game-key]").forEach((node) => node.addEventListener("click", (event) => {
    event.stopPropagation();
    try {
      const game = JSON.parse(decodeURIComponent(node.dataset.gameKey));
      scrollToGameKey(game.name || "this game");
      closeGameModal();
    } catch {}
  }));
}

function bindGameControls() {
  $("#gameSearch")?.addEventListener("input", (event) => { gamesState.query = event.target.value || ""; renderGames(); });
  $("#gameFilter")?.addEventListener("change", (event) => { gamesState.filter = event.target.value || "all"; renderGames(); });
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
  const pendingResetRaw = localStorage.getItem("airesz_pending_hwid_reset");
  if (pendingResetRaw) {
    localStorage.removeItem("airesz_pending_hwid_reset");
    let pending = {};
    try { pending = JSON.parse(pendingResetRaw) || {}; } catch {}
    setTimeout(() => resetHwidFromWebsite(null, String(pending.keyId || "")), 250);
  }
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

async function resetHwidFromWebsite(button = null, keyId = "") {
  if (!state.discordUser) {
    localStorage.setItem("airesz_pending_hwid_reset", JSON.stringify({ keyId: String(keyId || "") }));
    showToast("Login with Discord first to reset your HWID.", false);
    loginWithDiscord();
    return;
  }
  if (!confirm("Reset your Discord-linked HWID now? A successful reset starts a 6-hour cooldown. Lifetime keys have unlimited resets; temporary/giveaway keys keep their configured reset allowance.")) return;
  if (button) { button.disabled = true; button.textContent = "Resetting…"; }
  try {
    const data = await api("/api/client/discord/reset-hwid-web", { method: "POST", body: { keyId: keyId || undefined } });
    const unlimited = data.maxResets == null;
    const remaining = unlimited ? "Unlimited" : String(data.resetsRemaining ?? 0);
    showToast(unlimited
      ? "HWID reset successful ✓ · Unlimited resets · 6h cooldown started"
      : `HWID reset successful ✓ · ${remaining} reset${remaining === "1" ? "" : "s"} remaining · 6h cooldown started`, true);
    setMessage("HWID reset successfully. You can use the key on another device. The 6-hour self-reset cooldown is now active.", true);
    await loadMyKeys();
  } catch (error) {
    showToast(error?.message || "HWID reset failed.", false);
    setMessage(error?.message || "HWID reset failed.");
  } finally {
    if (button) { button.disabled = false; button.textContent = "↻ Reset HWID"; }
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
  if (!node) return;
  node.textContent = text;
  node.style.color = ok ? "#28dd8b" : "#ff6f8f";
}

let toastTimer = null;
function showToast(text, ok = true) {
  let node = $("#aireszToast");
  if (!node) {
    node = document.createElement("div");
    node.id = "aireszToast";
    node.className = "airesz-toast";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    document.body.appendChild(node);
  }
  node.textContent = text;
  node.classList.toggle("error", !ok);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
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

$("#topGetScriptBtn")?.addEventListener("click", async () => {
  await copySiteLoadstring($("#topGetScriptBtn"));
});
$("#heroGetScriptBtn")?.addEventListener("click", async () => {
  await copySiteLoadstring($("#heroGetScriptBtn"));
});
$("#startBtn").addEventListener("click", startRoute);
$$("button[data-product]").forEach((button) => {
  button.addEventListener("click", () => startProductCheckout(button.dataset.product || "LIFETIME"));
});
bindGameControls();

$("#closeGameModal")?.addEventListener("click", closeGameModal);
$$("[data-close-game-modal]").forEach((node) => node.addEventListener("click", closeGameModal));
$("#gameModalScriptBtn")?.addEventListener("click", async () => {
  const modal = $("#gameModal");
  try {
    const game = JSON.parse(modal?.dataset.gameJson || "null");
    if (game) {
      const copied = await copyGameScript(game, $("#gameModalScriptBtn"));
      $("#gameModalNotice").textContent = copied ? `Copied: ${getGameLoadstring()}` : "Clipboard permission was blocked.";
    }
  } catch {}
});
$("#gameModalKeyBtn")?.addEventListener("click", () => {
  const modal = $("#gameModal");
  if (modal?.dataset.gameName) scrollToGameKey(modal.dataset.gameName);
  closeGameModal();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeGameModal(); });
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
async function startProductCheckout(product = "LIFETIME") {
  const normalized = String(product || "LIFETIME").toUpperCase();
  if (!["LIFETIME", "PREMIUM", "BUNDLE"].includes(normalized)) {
    setMessage("Unknown Airesz product.");
    return;
  }

  const discordLinkToken = new URLSearchParams(location.search).get("discord_link") || "";

  if (!state.discordUser && !discordLinkToken) {
    localStorage.setItem("airesz_pending_product_checkout", normalized);
    setMessage("Login with Discord before buying. Returning you to checkout after login…", true);
    loginWithDiscord();
    return;
  }

  const buttons = $$("button[data-product]");
  buttons.forEach((button) => { button.disabled = true; });

  const label = normalized === "PREMIUM"
    ? "Premium Upgrade"
    : normalized === "BUNDLE"
      ? "Lifetime + Premium"
      : "Lifetime";

  setMessage(`Opening secure Stripe Checkout for ${label}…`, true);

  try {
    const data = await api("/api/stripe/checkout", {
      method: "POST",
      body: {
        clientToken: state.clientToken,
        product: normalized,
        ...(discordLinkToken ? { discordLinkToken } : {})
      }
    });

    if (!data.url) throw new Error("Stripe checkout URL was not returned.");
    location.href = data.url;
  } catch (error) {
    if (error?.data?.code === "BUNDLE_REQUIRED") {
      const amount = Number(error.data.bundleAmountCents || 799) / 100;
      const confirmed = window.confirm(
        `Premium $2.99 is for existing Lifetime users.\n\n` +
        `You do not have an active Lifetime key yet.\n` +
        `Buy Lifetime + Premium for $${amount.toFixed(2)} instead?`
      );

      if (confirmed) {
        buttons.forEach((button) => { button.disabled = false; });
        return startProductCheckout("BUNDLE");
      }

      setMessage("Premium checkout cancelled. You can buy Lifetime first or choose the $7.99 bundle.");
      return;
    }

    if (error?.data?.code === "PREMIUM_UPGRADE_RECOMMENDED") {
      const amount = Number(error.data.premiumAmountCents || 299) / 100;
      const confirmed = window.confirm(
        `You already own Lifetime.\n\nUpgrade that same key to Premium for $${amount.toFixed(2)}?`
      );

      if (confirmed) {
        buttons.forEach((button) => { button.disabled = false; });
        return startProductCheckout("PREMIUM");
      }

      setMessage("Bundle checkout cancelled.");
      return;
    }

    setMessage(error.message);
    await loadGlobalMaintenanceStatus();
    await loadCommerceConfig();
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function startLifetimeCheckout() {
  return startProductCheckout("LIFETIME");
}


async function handleStripeReturn() {
  const params = new URLSearchParams(location.search);
  const success = params.get("stripe_success");
  const cancel = params.get("stripe_cancel");
  const sessionId = params.get("session_id") || "";
  const requestedProductRaw = String(params.get("product") || "LIFETIME").toUpperCase();
  const requestedProduct = ["LIFETIME", "PREMIUM", "BUNDLE"].includes(requestedProductRaw)
    ? requestedProductRaw
    : "LIFETIME";

  const requestedLabel = requestedProduct === "PREMIUM"
    ? "Premium Upgrade"
    : requestedProduct === "BUNDLE"
      ? "Lifetime + Premium"
      : "Lifetime";

  if (cancel === "1") {
    setMessage(`Payment cancelled. No ${requestedLabel} purchase was applied.`);
    history.replaceState({}, "", location.pathname + location.hash);
    return;
  }

  // Do not require sessionId. Worker can recover a webhook-fulfilled order.
  if (success !== "1") return;

  setMessage(`Payment confirmed by Stripe. Preparing your ${requestedLabel} access…`, true);

  try {
    const data = await api("/api/stripe/claim", {
      method: "POST",
      body: {
        clientToken: state.clientToken,
        sessionId,
        product: requestedProduct
      }
    });

    if (!data.key) throw new Error("Stripe purchase key was not returned.");

    const product = String(data.product || requestedProduct).toUpperCase();
    const premiumAccess = product === "PREMIUM" || product === "BUNDLE";

    saveIssuedKey(data);
    $("#keyOutput").textContent = data.key;
    $("#expiryText").textContent = "Never expires";
    $("#keyBox").classList.remove("hidden");
    $("#routeState").textContent = premiumAccess ? "Premium Unlocked" : "Lifetime Unlocked";

    await loadMyKeys();

    if (product === "BUNDLE") {
      setMessage("🎉 Lifetime + Premium unlocked. One permanent Premium key is ready.", true);
    } else if (product === "PREMIUM") {
      setMessage("🎉 Premium upgrade complete. Your existing Lifetime key now has Premium access.", true);
    } else {
      setMessage("🎉 Lifetime purchase complete. Your permanent key is ready.", true);
    }

    location.hash = "my-keys";
  } catch (error) {
    setMessage(error?.message || `We could not confirm your ${requestedLabel} purchase yet.`);
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
      const pendingProduct = localStorage.getItem("airesz_pending_product_checkout") || (localStorage.getItem("airesz_pending_lifetime_checkout") === "1" ? "LIFETIME" : "");
      if (pendingProduct) {
        localStorage.removeItem("airesz_pending_product_checkout");
        localStorage.removeItem("airesz_pending_lifetime_checkout");
        await startProductCheckout(pendingProduct);
        return;
      }
    }
    if (location.hash === "#buy-lifetime") {
      setTimeout(() => $("#buyLifetimeBtn")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
    await loadGlobalMaintenanceStatus();
    await loadCommerceConfig();
    await loadGames();
    await loadProviders();
    await loadMyKeys();
    // Refresh countdown/state labels without re-fetching, so "Expiring Soon"
    // changes automatically when an active key crosses the 12-hour threshold.
    window.setInterval(() => renderMyKeys(), 60 * 1000);
    await handleStripeReturn();
    if (!state.session) await discoverActiveSession();
    if (state.session) {
      $("#routeState").textContent = "Resuming";
      $("#startBtn").innerHTML = '<span>↻</span> Route Started';
      renderSteps();
      const providerRejected = params.get("checkpoint") === "rejected" || params.has("error");
      const returnedFromProvider = params.has("resume") || params.has("checkpoint");

      if (providerRejected) {
        await refreshSession();
      } else if (returnedFromProvider) {
        await pollAfterReturn();
      } else {
        await refreshSession();
      }
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
