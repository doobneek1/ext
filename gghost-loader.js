(() => {
  const TEAM_RE = /^\/team\/location\/([0-9a-f-]+)/i;
  const pathMatch = (location.pathname || "").match(TEAM_RE);
  if (!pathMatch) return;
  const locationUuid = pathMatch[1];
  if (window.__GGHOST_LOADER_ACTIVE__) return;
  window.__GGHOST_LOADER_ACTIVE__ = true;
  const NOTES_PREVIEW_KEY_PREFIX = "ggNotesPreview:";
  const NOTES_PREVIEW_TTL_MS = 6 * 60 * 60 * 1000;
  const NOTES_HIDDEN_STORAGE_KEY = "hideNotes";
  const PREVIEW_ID = "gg-note-preload";
  const PREVIEW_STYLE_ID = "gg-note-preload-style";
  const previewCacheKey = `${NOTES_PREVIEW_KEY_PREFIX}${locationUuid}`;
  const hasNotesUi = () => !!(
    document.getElementById("gg-note-wrapper")
    || document.getElementById("gg-note-overlay")
    || document.getElementById("gg-note-username-banner")
  );
  const ensurePreviewStyle = () => {
    if (document.getElementById(PREVIEW_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PREVIEW_STYLE_ID;
    style.textContent = `html.gg-hide-notes #${PREVIEW_ID} { display: none !important; }`;
    (document.head || document.documentElement).appendChild(style);
  };
  const renderNotesPreview = (latest) => {
    if (!latest || typeof latest !== "object") return;
    if (!document.body || document.getElementById(PREVIEW_ID)) return;
    const rawNote = typeof latest.note === "string"
      ? latest.note
      : latest.note != null
        ? JSON.stringify(latest.note)
        : "";
    if (!rawNote) return;
    const noteText = rawNote.length > 240 ? `${rawNote.slice(0, 237)}...` : rawNote;
    const container = document.createElement("div");
    container.id = PREVIEW_ID;
    container.setAttribute("data-uuid", locationUuid);
    Object.assign(container.style, {
      position: "fixed",
      top: "100px",
      right: "20px",
      width: "280px",
      maxHeight: "180px",
      overflow: "hidden",
      background: "#fff9e6",
      border: "2px dashed #cc9a00",
      borderRadius: "8px",
      padding: "8px 10px",
      fontSize: "12px",
      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
      zIndex: 9998,
      whiteSpace: "pre-wrap"
    });
    const title = document.createElement("div");
    title.textContent = "Notes (cached)";
    Object.assign(title.style, {
      fontWeight: "bold",
      marginBottom: "6px",
      fontSize: "12px"
    });
    const metaParts = [];
    if (latest.user) metaParts.push(String(latest.user));
    if (latest.date) metaParts.push(`(${latest.date})`);
    const meta = metaParts.length ? `${metaParts.join(" ")}: ` : "";
    const body = document.createElement("div");
    body.textContent = `${meta}${noteText}`;
    container.appendChild(title);
    container.appendChild(body);
    ensurePreviewStyle();
    document.body.appendChild(container);
  };
  const maybeShowNotesPreview = () => {
    if (!chrome?.storage?.local) return;
    if (document.getElementById(PREVIEW_ID)) return;
    if (hasNotesUi()) return;
    if (!document.body) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", maybeShowNotesPreview, { once: true });
      }
      return;
    }
    try {
      chrome.storage.local.get([previewCacheKey, NOTES_HIDDEN_STORAGE_KEY], (payload) => {
        if (payload?.[NOTES_HIDDEN_STORAGE_KEY]) return;
        const cached = payload?.[previewCacheKey];
        if (!cached || typeof cached !== "object") return;
        const ts = Number(cached.ts) || 0;
        if (ts && Date.now() - ts > NOTES_PREVIEW_TTL_MS) return;
        renderNotesPreview(cached.latest);
      });
    } catch {
      // ignore preview failures
    }
  };
  if (chrome?.runtime?.sendMessage) {
    try {
      chrome.runtime.sendMessage({ type: "PREFETCH_NOTES", uuid: locationUuid });
    } catch {
      // ignore prefetch failures
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeShowNotesPreview, { once: true });
  } else {
    maybeShowNotesPreview();
  }
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes?.[previewCacheKey]) return;
      if (hasNotesUi()) return;
      maybeShowNotesPreview();
    });
  }
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
