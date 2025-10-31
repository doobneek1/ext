// content-script.js
const APP_ORIGIN = "http://localhost:3210"; // your domain

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
      // Get Cognito tokens from localStorage (same logic as gghost.js)
      function getCognitoTokens() {
        try {
          const storage = localStorage;
          let accessToken = null;
          let idToken = null;
          let refreshToken = null;
          let username = null;

          // Find Cognito tokens by scanning localStorage
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key && key.startsWith('CognitoIdentityServiceProvider.')) {
              if (key.includes('.accessToken')) {
                accessToken = storage.getItem(key);
              } else if (key.includes('.idToken')) {
                idToken = storage.getItem(key);
              } else if (key.includes('.refreshToken')) {
                refreshToken = storage.getItem(key);
              } else if (key.includes('.LastAuthUser')) {
                username = storage.getItem(key);
              }
            }
          }

          return { accessToken, idToken, refreshToken, username };
        } catch (error) {
          console.warn('[getCognitoTokens] Error accessing localStorage:', error);
          return { accessToken: null, idToken: null, refreshToken: null, username: null };
        }
      }

      const { accessToken, idToken, refreshToken, username } = getCognitoTokens();
      frame.contentWindow.postMessage(
        { type: "CREDS", payload: { username, accessToken, idToken, refreshToken } },
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
// (async () => { ... window.postMessage({type:"CREDENTIALS", ...}, "http://localhost:3210"); })();
