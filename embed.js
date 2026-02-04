// embed.js
(async function () {
  const params = new URLSearchParams(location.search);
  const nonce  = params.get("nonce") || String(Date.now());
  const HOST   = "https://doobneek.org";
  // 🔧 Read both old and new keys; prefer the new ones
  const got = await chrome.storage.local.get([
    "userName", "userPassword",
    "lastLoopUserName", "lastLoopUserPassword",
  ]);
  const userName = (got.userName || got.lastLoopUserName || "").trim();
  const userPassword = got.userPassword ?? got.lastLoopUserPassword ?? "";
  // For loop mode, uuid is not needed
  const src = `${HOST}/embed?mode=loop&nonce=${encodeURIComponent(nonce)}&parent=${encodeURIComponent(location.origin)}`;
  const EMBED_ORIGIN = new URL(src).origin;
  const iframe = document.createElement("iframe");
  Object.assign(iframe, { src, allow: "clipboard-read; clipboard-write" });
  Object.assign(iframe.style, { border: "0", width: "100%", height: "100%" });
  (document.getElementById("wrap") || document.body).appendChild(iframe);
  // Proactively send credentials when the iframe is loaded.
  // This helps prevent a race condition where the iframe's authentication attempt
  // happens before it has received the credentials.
  iframe.onload = () => {
    iframe.contentWindow.postMessage(
      { type: "CREDS", payload: { userName, userPassword, nonce } },
      EMBED_ORIGIN
    );
  };
  window.addEventListener("message", (e) => {
    if (e.source !== iframe.contentWindow) return;
    if (e.origin !== EMBED_ORIGIN) return;
    const { type, payload } = e.data || {};
    // The REQUEST_CREDS handler is kept as a fallback, in case the proactive
    // message is missed or the iframe needs to request credentials again.
    if (type === "REQUEST_CREDS") {
      const ok = !payload?.nonce || payload.nonce === nonce;
      if (!ok) return;
      // ✅ Send the creds we actually have
      iframe.contentWindow.postMessage(
        { type: "CREDS", payload: { userName, userPassword, nonce } },
        EMBED_ORIGIN
      );
    } else if (type === "CLOSE_EMBED") {
      window.close();
    }
  });
})();
