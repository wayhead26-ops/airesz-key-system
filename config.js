window.AIRESZ_CONFIG = Object.freeze({
  workerUrl: "https://airesz-key-api.airesz-key-system.workers.dev",
  supportUrl: "https://discord.gg/BzFx6DXyuz",
  scriptLoaderUrl: "https://pastebin.com/raw/ehQa2Qj1"
});

(() => {
  const nativeFetch = window.fetch.bind(window);
  const workerOrigin = new URL(window.AIRESZ_CONFIG.workerUrl).origin;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function isAireszApiRequest(input) {
    try {
      const rawUrl = typeof input === "string" ? input : input?.url;
      if (!rawUrl) return false;
      const url = new URL(rawUrl, location.href);
      return url.origin === workerOrigin && (
        url.pathname.startsWith("/api/") ||
        url.pathname === "/health" ||
        url.pathname === "/status" ||
        url.pathname.startsWith("/status/")
      );
    } catch {
      return false;
    }
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function showNetworkRetry() {
    const message = document.querySelector("#message");
    if (!message) return;

    message.style.color = "#ff6f8f";
    message.textContent = "Unable to reach Airesz API. Check your connection, VPN, Private DNS or ad blocker.";

    let button = document.querySelector("#aireszNetworkRetry");
    if (!button) {
      button = document.createElement("button");
      button.id = "aireszNetworkRetry";
      button.type = "button";
      button.textContent = "↻ Retry Connection";
      button.style.cssText = "margin-left:10px;padding:7px 12px;border:1px solid #6f55d9;border-radius:10px;background:#241b45;color:#f4f1ff;font:inherit;font-weight:700;cursor:pointer;";
      button.addEventListener("click", () => location.reload());
      message.appendChild(button);
    }

    const routeState = document.querySelector("#routeState");
    if (routeState) routeState.textContent = "Connection Error";
  }

  window.fetch = async function aireszFetch(input, init) {
    if (!isAireszApiRequest(input)) {
      return nativeFetch(input, init);
    }

    const method = requestMethod(input, init);
    const safeToRetry = method === "GET" || method === "HEAD";
    const maxAttempts = safeToRetry ? 3 : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await nativeFetch(input, init);
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await sleep(350 * attempt);
        }
      }
    }

    console.warn("[AIRESZ] API request could not reach the Worker.", lastError);
    setTimeout(showNetworkRetry, 0);

    return new Response(JSON.stringify({
      ok: false,
      code: "AIRESZ_API_UNREACHABLE",
      error: "Unable to reach Airesz API. Check your connection, VPN, Private DNS or ad blocker, then retry."
    }), {
      status: 503,
      headers: { "content-type": "application/json" }
    });
  };
})();
