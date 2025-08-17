// content-script.js
const APP_ORIGIN = "https://doobneek.org"; // your domain

function ensureAppOverlay(urlPath = "/embed") {
  if (document.getElementById("dnk-embed-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "dnk-embed-overlay";
  Object.assign(overlay.style, {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    zIndex: 2147483647, display: "flex", alignItems: "center", justifyContent: "center"
  });

  const frame = document.createElement("iframe");
  frame.src = `${APP_ORIGIN}${urlPath}`; // e.g. /embed?uuid=...&mode=sitevisit
  Object.assign(frame.style, {
    width: "860px", height: "70vh", background: "#fff",
    border: "2px solid #000", borderRadius: "8px"
  });

  // Close on backdrop click
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  // Handshake: iframe -> "REQUEST_CREDS" ; content-script -> "CREDS"
  const onMessage = async (ev) => {
    if (ev.origin !== APP_ORIGIN) return; // only accept messages from your iframe
    const { type } = ev.data || {};
    if (type === "REQUEST_CREDS") {
      const { userName = null, userPassword = null } = await chrome.storage.local.get(["userName", "userPassword"]);
      frame.contentWindow.postMessage(
        { type: "CREDS", payload: { userName, userPassword } },
        APP_ORIGIN
      );
    }
    if (type === "CLOSE_EMBED") {
      overlay.remove();
      window.removeEventListener("message", onMessage);
    }
  };

  window.addEventListener("message", onMessage);
}

// Example usage from your existing button code:
// ensureAppOverlay(`/embed?uuid=${encodeURIComponent(uuid)}&mode=sitevisit`);

// ⛔ Remove the extra poster below; not needed for the handshake flow
// (async () => { ... window.postMessage({type:"CREDENTIALS", ...}, "https://doobneek.org"); })();
