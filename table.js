const COGNITO_TOKEN_CACHE_KEY = "doobneekCognitoTokens";
const statusEl = document.getElementById("status");
const contentEl = document.getElementById("content");
const params = new URLSearchParams(location.search);
const embedUrlParam = params.get("embedUrl");
const nonce = params.get("nonce") || "";
const persistTokens = (tokens = {}) => {
  if (!tokens || typeof chrome === "undefined" || !chrome.storage?.local) return;
  chrome.storage.local.set({
    [COGNITO_TOKEN_CACHE_KEY]: {
      accessToken: tokens.accessToken || null,
      idToken: tokens.idToken || null,
      refreshToken: tokens.refreshToken || null,
      username: tokens.username || null,
      updatedAt: Date.now()
    }
  });
};
const setStatus = (text, isError = false) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.display = text ? "inline-flex" : "none";
  statusEl.style.background = isError ? "rgba(210,20,20,0.9)" : "rgba(0,0,0,0.7)";
};
if (!embedUrlParam) {
  setStatus("Missing embed url", true);
  contentEl.innerHTML = "";
  throw new Error("No embedUrl provided");
}
let iframe;
try {
  iframe = document.createElement("iframe");
  iframe.src = embedUrlParam;
  iframe.allow = "geolocation *; microphone *; camera *; clipboard-read; clipboard-write";
  iframe.style.background = "#fff";
  contentEl.appendChild(iframe);
} catch (error) {
  setStatus("Invalid embed URL", true);
  console.error(error);
}
const embedOrigin = new URL(embedUrlParam).origin;
const requestTokensFromEmbed = (requestedNonce) => {
  iframe?.contentWindow?.postMessage(
    { type: "REQUEST_TOKENS", payload: { nonce: requestedNonce || nonce } },
    embedOrigin
  );
};
const getStoredTokens = () => new Promise((resolve) => {
  chrome.storage.local.get(COGNITO_TOKEN_CACHE_KEY, (data) => {
    resolve(data[COGNITO_TOKEN_CACHE_KEY] || null);
  });
});
const sendCreds = async (requestedNonce) => {
  const tokens = await getStoredTokens();
  if (!tokens) {
    setStatus("Waiting for embed login to provide tokens...", false);
    return;
  }
  const payload = {
    username: tokens.username || null,
    accessToken: tokens.accessToken || null,
    idToken: tokens.idToken || null,
    refreshToken: tokens.refreshToken || null,
    nonce: requestedNonce || nonce || null
  };
  iframe?.contentWindow?.postMessage({ type: "CREDS", payload }, embedOrigin);
  setStatus("Table loaded", false);
};
iframe?.addEventListener("load", () => {
  void sendCreds(nonce);
  requestTokensFromEmbed(nonce);
});
const handleMessage = async (event) => {
  if (event.source !== iframe?.contentWindow) return;
  if (event.origin !== embedOrigin) return;
  const { type, payload } = event.data || {};
  if (type === "REQUEST_CREDS") {
    await sendCreds(payload?.nonce);
  } else if (type === "TOKENS") {
    persistTokens(payload);
    setStatus("Table loaded", false);
  } else if (type === "TOKENS_UNAVAILABLE") {
    setStatus(payload?.error || "Embed needs authentication", true);
  } else if (type === "CLOSE_EMBED") {
    window.close();
  }
};
window.addEventListener("message", handleMessage);
const closeBtn = document.getElementById("closeBtn");
closeBtn?.addEventListener("click", () => window.close());
setStatus("Waiting for embed login to share tokens", false);
