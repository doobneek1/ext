// embed.js
(async function () {
  const params = new URLSearchParams(location.search);
  const nonce  = params.get("nonce") || String(Date.now());
  const HOST   = "http://localhost:3210";

  // 🔧 Get JWT tokens from Cognito localStorage
  function getCognitoTokens() {
    try {
      const storage = localStorage;
      let accessToken = null;
      let idToken = null;
      let username = null;
      let refreshToken = null;

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

      // Validate tokens (basic JWT format check)
      const isValidJWT = (token) => token && typeof token === 'string' && token.split('.').length === 3;
      
      if (!isValidJWT(accessToken) || !isValidJWT(idToken)) {
        console.warn('[getCognitoTokens] Invalid or missing JWT tokens');
        return { accessToken: null, idToken: null, username: null, refreshToken: null };
      }

      return { accessToken, idToken, username, refreshToken };
    } catch (error) {
      console.warn('[getCognitoTokens] Error accessing localStorage:', error);
      return { accessToken: null, idToken: null, username: null, refreshToken: null };
    }
  }

  const { accessToken, idToken, username, refreshToken } = getCognitoTokens();

  // For loop mode, uuid is not needed
  const src = `${HOST}/embed?mode=loop&nonce=${encodeURIComponent(nonce)}&parent=${encodeURIComponent(location.origin)}`;
  const EMBED_ORIGIN = new URL(src).origin;

  const iframe = document.createElement("iframe");
  Object.assign(iframe, { src, allow: "clipboard-read; clipboard-write" });
  Object.assign(iframe.style, { border: "0", width: "100%", height: "100%" });
  (document.getElementById("wrap") || document.body).appendChild(iframe);

  window.addEventListener("message", (e) => {
    if (e.source !== iframe.contentWindow) return;
    if (e.origin !== EMBED_ORIGIN) return;
    const { type, payload } = e.data || {};

    if (type === "REQUEST_CREDS") {
      const ok = !payload?.nonce || payload.nonce === nonce;
      if (!ok) return;
      
      // ✅ Send the Cognito JWT tokens
      iframe.contentWindow.postMessage(
        { 
          type: "CREDS", 
          payload: { 
            username,
            accessToken,
            idToken,
            refreshToken,
            authType: 'cognito_jwt',
            nonce 
          } 
        },
        EMBED_ORIGIN
      );
    } else if (type === "CLOSE_EMBED") {
      window.close();
    }
  });
})();
