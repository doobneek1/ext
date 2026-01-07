(() => {
  const TEAM_RE = /^\/team\/location\/[0-9a-f-]+/i;
  if (!TEAM_RE.test(location.pathname || "")) return;
  if (window.__GGHOST_LOADER_ACTIVE__) return;
  window.__GGHOST_LOADER_ACTIVE__ = true;
  let attempts = 0;
  const maxAttempts = 3;
  const isRootReady = () => {
    const root = document.getElementById("root");
    if (!root) return false;
    if (root.childElementCount === 0) return false;
    const text = (root.textContent || "").replace(/\s+/g, "");
    return text.length > 0 || root.querySelector("*") != null;
  };
  const requestInject = () => {
    if (window.__GGHOST_LOADER_DONE__) return;
    if (attempts >= maxAttempts) return;
    if (!isRootReady()) {
      setTimeout(requestInject, 1500);
      return;
    }
    attempts += 1;
    if (!chrome?.runtime?.sendMessage) return;
    try {
      chrome.runtime.sendMessage({ type: "INJECT_GGHOST" }, (resp) => {
        let err = null;
        try {
          err = chrome?.runtime?.lastError;
        } catch {
          setTimeout(requestInject, 1500 * attempts);
          return;
        }
        if (err) {
          setTimeout(requestInject, 1500 * attempts);
          return;
        }
        if (resp && resp.ok) {
          window.__GGHOST_LOADER_DONE__ = true;
          return;
        }
        setTimeout(requestInject, 1500 * attempts);
      });
    } catch {
      setTimeout(requestInject, 1500 * attempts);
    }
  };
  const scheduleInject = () => {
    setTimeout(() => {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(requestInject, { timeout: 8000 });
      } else {
        requestInject();
      }
    }, 6000);
  };
  if (document.readyState === "complete") {
    scheduleInject();
  } else {
    window.addEventListener("load", scheduleInject, { once: true });
  }
  setTimeout(requestInject, 20000);
})();
