// content-script.js
const PROD_SHEETS_ORIGIN = "https://sheets.doobneek.org";
const LOCAL_SHEETS_ORIGINS = [
  "http://sheets.localhost:3210",
  "https://sheets.localhost:3210"
];
const LOCAL_SHEETS_TEST_PATH = "/favicon.ico";
const EMBED_ORIGIN_OVERRIDE_KEY = "doobneekSheetsEmbedOrigin";
const COGNITO_TOKEN_CACHE_KEY = "doobneekCognitoTokens";
const OVERLAY_STATE_PREFIX = "sheetsOverlayState:";
const buildOverlayStateKey = (tabId) => `${OVERLAY_STATE_PREFIX}${tabId}`;
const getActiveTabId = (() => {
  let promise = null;
  return () => {
    if (promise) return promise;
    promise = new Promise((resolve) => {
      if (!chrome?.runtime?.sendMessage) {
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: "GET_TAB_ID" }, (response) => {
          resolve(response?.tabId ?? null);
        });
      } catch (err) {
        console.warn("[SheetsEmbed] Failed to get tab id:", err);
        resolve(null);
      }
    });
    return promise;
  };
})();
const persistOverlayState = async (tabId, urlPath) => {
  if (!tabId || !chrome?.storage?.local) return;
  try {
    await chrome.storage.local.set({
      [buildOverlayStateKey(tabId)]: { open: true, urlPath, updatedAt: Date.now() }
    });
  } catch (error) {
    console.warn("[SheetsEmbed] Failed to persist overlay state:", error);
  }
};
const clearOverlayState = async (tabId) => {
  if (!tabId || !chrome?.storage?.local) return;
  try {
    await chrome.storage.local.remove(buildOverlayStateKey(tabId));
  } catch (error) {
    console.warn("[SheetsEmbed] Failed to clear overlay state:", error);
  }
};
const persistCognitoTokens = (tokens = {}) => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const { accessToken, idToken, refreshToken, username } = tokens;
  if (!accessToken && !idToken && !refreshToken) return;
  try {
    chrome.storage.local.set({
      [COGNITO_TOKEN_CACHE_KEY]: {
        accessToken,
        idToken,
        refreshToken,
        username,
        updatedAt: Date.now()
      }
    });
  } catch (error) {
    console.warn("[SheetsEmbed] Failed to persist tokens:", error);
  }
};
const readStoredCognitoTokens = () => {
  try {
    const storage = localStorage;
    let accessToken = null;
    let idToken = null;
    let refreshToken = null;
    let username = null;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith("CognitoIdentityServiceProvider.")) continue;
      if (key.includes(".accessToken")) {
        accessToken = storage.getItem(key);
      } else if (key.includes(".idToken")) {
        idToken = storage.getItem(key);
      } else if (key.includes(".refreshToken")) {
        refreshToken = storage.getItem(key);
      } else if (key.includes(".LastAuthUser")) {
        username = storage.getItem(key);
      }
    }
    return { accessToken, idToken, refreshToken, username };
  } catch (error) {
    console.warn("[SheetsEmbed] Unable to read Cognito tokens from storage:", error);
    return { accessToken: null, idToken: null, refreshToken: null, username: null };
  }
};
const cacheTokensFromPage = () => {
  const tokens = readStoredCognitoTokens();
  persistCognitoTokens(tokens);
  return tokens;
};
const readEmbedOriginOverride = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const manualOverride =
    typeof window.__SHEETS_EMBED_ORIGIN === "string" && window.__SHEETS_EMBED_ORIGIN.trim();
  if (manualOverride) {
    return manualOverride.trim();
  }
  try {
    const stored = localStorage.getItem(EMBED_ORIGIN_OVERRIDE_KEY);
    if (stored?.trim()) {
      return stored.trim();
    }
  } catch (error) {
    console.warn("[SheetsEmbed] Unable to read embed origin override:", error);
  }
  return null;
};
const isOriginReachable = async (origin) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 900);
  const normalized = origin.replace(/\/+$/, "");
  const url = `${normalized}${LOCAL_SHEETS_TEST_PATH}`;
  try {
    await fetch(url, {
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};
const resolveEmbedOrigin = (() => {
  let promise = null;
  return () => {
    if (promise) {
      return promise;
    }
    promise = (async () => {
      const override = readEmbedOriginOverride();
      if (override) {
        return override;
      }
      for (const origin of LOCAL_SHEETS_ORIGINS) {
        if (await isOriginReachable(origin)) {
          return origin;
        }
      }
      return PROD_SHEETS_ORIGIN;
    })();
    return promise;
  };
})();
async function ensureAppOverlay(urlPath = "/embed") {
  if (document.getElementById("dnk-embed-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "dnk-embed-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0.85)",
    zIndex: 2147483647,
    display: "flex",
    alignItems: "stretch",
    justifyContent: "stretch",
    padding: 0
  });
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  Object.assign(closeButton.style, {
    position: "absolute",
    top: "16px",
    right: "16px",
    zIndex: 2147483648,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "12px",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    cursor: "pointer"
  });
  const frame = document.createElement("iframe");
  const embedOrigin = await resolveEmbedOrigin();
  const normalizedPath = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  frame.src = `${embedOrigin}${normalizedPath}`; // e.g. /embed?uuid=...&mode=sitevisit
  Object.assign(frame.style, {
    width: "100%",
    height: "100%",
    background: "#fff",
    border: "0",
    borderRadius: "0"
  });
  overlay.appendChild(closeButton);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);
  const tabId = await getActiveTabId();
  if (tabId) {
    persistOverlayState(tabId, normalizedPath);
  }
  const nonce = crypto?.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint32Array(2))).map((n) => n.toString(36)).join("")
    : String(Date.now());
  const requestTokens = () => {
    frame?.contentWindow?.postMessage(
      { type: "REQUEST_TOKENS", payload: { nonce } },
      embedOrigin
    );
  };
  frame?.addEventListener("load", () => {
    requestTokens();
  });
  const tokenInterval = setInterval(requestTokens, 5000);
  const cleanupOverlay = () => {
    clearInterval(tokenInterval);
    window.removeEventListener("message", onMessage);
  };
  const closeOverlay = () => {
    cleanupOverlay();
    overlay.remove();
    if (tabId) {
      clearOverlayState(tabId);
    }
  };
  const onMessage = async (ev) => {
    const validOrigin = await resolveEmbedOrigin();
    if (ev.origin !== validOrigin) return; // only accept messages from your iframe
    const { type, payload } = ev.data || {};
    if (type === "REQUEST_CREDS") {
      const creds = cacheTokensFromPage();
      frame.contentWindow.postMessage(
        {
          type: "CREDS",
          payload: { ...creds, nonce: ev.data?.payload?.nonce }
        },
        validOrigin
      );
    } else if (type === "TOKENS") {
      persistCognitoTokens(payload);
    } else if (type === "CLOSE_EMBED") {
      closeOverlay();
    }
  };
  window.addEventListener("message", onMessage);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closeOverlay();
  });
}
// Example usage from your existing button code:
// ensureAppOverlay(`/embed?uuid=${encodeURIComponent(uuid)}&mode=sitevisit`);
// ⛔ Remove the extra poster below; not needed for the handshake flow
// (async () => { ... window.postMessage({type:"CREDENTIALS", ...}, "https://doobneek.org"); })();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SHOW_TABLE_OVERLAY") {
    ensureAppOverlay(message.urlPath || "/embed?mode=table");
    sendResponse({ ok: true });
  }
});
cacheTokensFromPage();
(async () => {
  const tabId = await getActiveTabId();
  if (!tabId || !chrome?.storage?.local) return;
  try {
    const stored = await chrome.storage.local.get(buildOverlayStateKey(tabId));
    const state = stored[buildOverlayStateKey(tabId)];
    if (state?.open && state?.urlPath) {
      ensureAppOverlay(state.urlPath);
    }
  } catch (error) {
    console.warn("[SheetsEmbed] Failed to restore overlay state:", error);
  }
})();
