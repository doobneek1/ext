(() => {
  if (!/^https:\/\/gogetta\.nyc\/team\/location\//.test(location.href)) return;
  const baseURL = window.gghost?.baseURL; // e.g. "https://.../locationNotes/notes"
  if (!baseURL) return;
  const withFirebaseAuth = window.gghost?.withFirebaseAuth;
  const applyAuth = typeof withFirebaseAuth === "function"
    ? withFirebaseAuth
    : (url) => url;
  let lastRenderedPath = null;
  let currentSnackbar = null;
  let lastFetchOk = false;
  let lastGoodNotes = null;
  let lastGoodPath = null;
  let lastGoodAt = 0;
  let retryTimer = null;
  let retryCount = 0;
  let fetchInFlight = false;
  const FETCH_TIMEOUT_MS = 8000;
  const FETCH_RETRY_LIMIT = 2;
  const FETCH_RETRY_BASE_MS = 1200;
  const FETCH_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  function buildPageNotesUrls(pagePath) {
    const normalized = String(pagePath || "").replace(/\/+$/, "");
    if (!normalized) return { primaryUrl: "", fallbackUrl: "" };
    const encodedKey = encodeURIComponent(normalized);
    const primaryUrl = applyAuth(`${baseURL}locationNotes/${encodedKey}.json`);
    const fallbackPath = normalized.replace(/^\/+/, "");
    const fallbackUrl = fallbackPath
      ? applyAuth(`${baseURL}locationNotes/${fallbackPath}.json`)
      : primaryUrl;
    return { primaryUrl, fallbackUrl };
  }
  const getCurrentUserName = async () => {
    if (window.gghostUserName) return window.gghostUserName;
    if (typeof window.getUserNameSafely === "function") {
      try { return await window.getUserNameSafely(); } catch {}
    }
    return "";
  };
  function scheduleSnackbarRetry() {
    if (retryTimer || retryCount >= FETCH_RETRY_LIMIT) return;
    const delay = FETCH_RETRY_BASE_MS * Math.pow(2, retryCount);
    retryCount += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      fetchAndRender();
    }, delay);
  }
  async function fetchJsonWithRetry(url, { attempts = FETCH_RETRY_LIMIT, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { ok: true, data };
      } catch (err) {
        if (err && err.name === 'AbortError') {
          lastError = new Error(`Fetch timeout after ${timeoutMs}ms`);
        } else {
          lastError = err;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, error: lastError };
  }
  // Parse dateKey or value for a timestamp. Return { date: Date, dateOnly: boolean } or null
function parseWhen(dateKey, noteVal) {
  if (!dateKey) return null;
  // Prefer timestamps inside the value if present
  if (noteVal && typeof noteVal === "object") {
    const ts = noteVal.ts ?? noteVal.timestamp ?? noteVal.updatedAt;
    if (ts != null) {
      if (typeof ts === "number") {
        // Handle both seconds and milliseconds
        const ms = ts < 1e12 ? ts * 1000 : ts;
        const d = new Date(ms);
        if (!isNaN(d)) return { date: d, dateOnly: false };
      } else {
        const d = new Date(String(ts));
        if (!isNaN(d)) return { date: d, dateOnly: false };
      }
    }
  }
  // ISO with time
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateKey)) {
    const d = new Date(dateKey);
    if (!isNaN(d)) return { date: d, dateOnly: false };
  }
  // Epoch seconds / ms in the KEY
  if (/^\d{10}$/.test(dateKey)) return { date: new Date(Number(dateKey) * 1000), dateOnly: false };
  if (/^\d{13}$/.test(dateKey)) return { date: new Date(Number(dateKey)), dateOnly: false };
  // YYYY-MM-DD (day only) — interpret at local midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const localMidnight = new Date(y, m - 1, d);
    if (!isNaN(localMidnight)) return { date: localMidnight, dateOnly: true };
  }
  // Fallback: try native parse
  const d = new Date(dateKey);
  if (!isNaN(d)) return { date: d, dateOnly: false };
  return null;
}
// Human-friendly; when dateOnly=true, compare by local date without negatives
function timeAgo(when, dateOnly) {
  const now = new Date();
  if (dateOnly) {
    // Compare local dates only
    const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d1 = new Date(when.getFullYear(), when.getMonth(), when.getDate());
    let days = Math.round((d0 - d1) / 86400000);
    // Never show negative for date-only (future or UTC/day-boundary issues)
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  }
  // For full timestamps, clamp small future skews
  let ms = now - when;
  // If it's in the future but within 2 minutes, treat as "just now"
  if (ms < 0 && ms > -120000) ms = 0;
  if (ms < 0) {
    // If you prefer not to show future phrasing, you can return "just now" here too
    const secFuture = Math.floor((-ms) / 1000);
    if (secFuture < 60) return "just now";
    const minFuture = Math.floor(secFuture / 60);
    if (minFuture < 60) return `in ${minFuture} minutes`;
    const hrFuture = Math.floor(minFuture / 60);
    if (hrFuture < 24) return `in ${hrFuture} hours`;
    const dayFuture = Math.floor(hrFuture / 24);
    return `in ${dayFuture} days`;
  }
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return sec <= 1 ? "just now" : `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  return `${day} days ago`;
}
function watchSpaNavigation() {
  ["pushState", "replaceState"].forEach((m) => {
    const orig = history[m];
    history[m] = function(...args) {
      const ret = orig.apply(this, args);
      window.dispatchEvent(new Event("spa:navigation"));
      return ret;
    };
  });
  window.addEventListener("spa:navigation", onRouteChange);
  window.addEventListener("popstate", onRouteChange);
  window.addEventListener("hashchange", onRouteChange);
  if ("navigation" in window) {
    navigation.addEventListener("navigate", onRouteChange);
  }
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onRouteChange();
    }
  }, 500);
}
watchSpaNavigation();
  // Parse dateKey or value for a timestamp. Return { date: Date, dateOnly: boolean } or null
  function parseWhen(dateKey, noteVal) {
    if (!dateKey) return null;
    // Prefer timestamps inside the value if present
    if (noteVal && typeof noteVal === "object") {
      const ts = noteVal.ts || noteVal.timestamp || noteVal.updatedAt;
      if (ts) {
        const d = typeof ts === "number" ? new Date(ts) : new Date(String(ts));
        if (!isNaN(d)) return { date: d, dateOnly: false };
      }
    }
    // ISO with time
    if (/^\d{4}-\d{2}-\d{2}T/.test(dateKey)) {
      const d = new Date(dateKey);
      if (!isNaN(d)) return { date: d, dateOnly: false };
    }
    // Epoch seconds / ms
    if (/^\d{10}$/.test(dateKey)) return { date: new Date(Number(dateKey) * 1000), dateOnly: false };
    if (/^\d{13}$/.test(dateKey)) return { date: new Date(Number(dateKey)), dateOnly: false };
    // YYYY-MM-DD (day only)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      const [y, m, d] = dateKey.split("-").map(Number);
      const localMidnight = new Date(y, (m - 1), d); // local tz midnight
      if (!isNaN(localMidnight)) return { date: localMidnight, dateOnly: true };
    }
    // Fallback: try native parse
    const d = new Date(dateKey);
    if (!isNaN(d)) return { date: d, dateOnly: false };
    return null;
  }
  function keyMatchesPage(topKeyRaw) {
    let decoded = topKeyRaw;
    try { decoded = decodeURIComponent(topKeyRaw); } catch {}
    const pagePath = location.pathname.replace(/\/+$/, "");
    const keyPath  = String(decoded).replace(/\/+$/, "");
    return keyPath && pagePath.endsWith(keyPath);
  }
  function parseNoteValue(noteVal) {
    if (!noteVal) return null;
    if (typeof noteVal === "object") return noteVal;
    if (typeof noteVal === "string") {
      try {
        const parsed = JSON.parse(noteVal);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {}
    }
    return null;
  }
  function normalizeTextValue(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }
  function coerceComparableValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  function isMinorTextChange(before, after) {
    const a = normalizeTextValue(before);
    const b = normalizeTextValue(after);
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.abs(a.length - b.length) <= 3 && (a.includes(b) || b.includes(a))) return true;
    return false;
  }
  function isCopyeditMeta(meta) {
    if (!meta || typeof meta !== 'object') return false;
    const flag = meta.copyedit ?? meta.copyeditFlag ?? meta.copyedit_flag ?? meta.copyEdit;
    if (typeof flag === 'boolean') return flag;
    if (flag == null) return false;
    const text = String(flag).trim().toLowerCase();
    return text === 'true' || text === '1' || text === 'yes' || text === 'y';
  }
  function scoreEditValue(meta) {
    if (!meta || typeof meta !== 'object' || meta.type !== 'edit') {
      return { score: 1, label: 'NOTE', color: '#6b7280', text: '#f8fafc', border: '#4b5563' };
    }
    if (isCopyeditMeta(meta)) {
      return {
        score: 1,
        label: 'COPY',
        badgeText: 'COPY',
        color: '#64748b',
        text: '#f8fafc',
        border: '#475569'
      };
    }
    const action = String(meta.action || '').toLowerCase();
    const summary = String(meta.summary || meta.note || '');
    const fieldText = `${meta.field || ''} ${meta.label || ''} ${summary}`.toLowerCase();
    let score = 1;
    if (action === 'create' || action === 'delete') score = 5;
    if (/created service|deleted service/.test(summary.toLowerCase())) score = 5;
    if (/(hours|schedule|opening|holiday)/.test(fieldText)) score = Math.max(score, 4);
    if (/(service)/.test(fieldText) && /(add|create|delete)/.test(fieldText)) score = Math.max(score, 4);
    if (/(address|phone|email|website)/.test(fieldText)) score = Math.max(score, 3);
    if (/(required documents|age requirement|eligibility|event info|taxonomy)/.test(fieldText)) score = Math.max(score, 2);
    if (/(description|notes?|copy|typo|spelling|grammar)/.test(fieldText)) score = Math.max(score, 1);
    if (action !== 'create' && action !== 'delete') {
      const beforeText = coerceComparableValue(meta.before);
      const afterText = coerceComparableValue(meta.after);
      if (beforeText && afterText && isMinorTextChange(beforeText, afterText)) {
        score = Math.min(score, 1);
      } else if (beforeText && afterText && Math.abs(afterText.length - beforeText.length) > 120) {
        score = Math.max(score, 3);
      }
    }
    let label = 'LOW';
    let color = '#6b7280';
    let text = '#f8fafc';
    let border = '#4b5563';
    if (score >= 4) {
      label = 'HIGH';
      color = '#16a34a';
      text = '#f8fafc';
      border = '#15803d';
    } else if (score >= 3) {
      label = 'MED';
      color = '#f59e0b';
      text = '#111827';
      border = '#d97706';
    } else if (score >= 2) {
      label = 'LOW';
      color = '#94a3b8';
      text = '#111827';
      border = '#64748b';
    }
    return { score, label, color, text, border };
  }
  function normalizeRecordsForTopKey(userMap) {
    // Expect: { userKey: { dateKey: noteVal, ... }, ... }
    const items = [];
    if (!userMap || typeof userMap !== "object") return items;
    const skipUserKeys = new Set([
      "invocations",
      "invocation",
      "locationinvocation",
      "locationinvocations"
    ]);
    for (const [userKey, dateMap] of Object.entries(userMap)) {
      if (skipUserKeys.has(String(userKey || "").toLowerCase())) continue;
      if (!dateMap || typeof dateMap !== "object") continue;
      for (const [dateKey, noteVal] of Object.entries(dateMap)) {
        const info = parseWhen(dateKey, noteVal);
        if (!info) continue;
        const userName = userKey.replace(/-futurenote$/i, "");
        const meta = parseNoteValue(noteVal);
        const detail = meta && meta.type === "edit"
          ? (meta.summary || meta.note || (meta.label ? `Updated ${meta.label}` : null))
          : null;
        items.push({ userName, date: info.date, dateOnly: info.dateOnly, detail, meta });
      }
    }
    items.sort((a, b) => b.date - a.date);
    return items;
  }
  function destroySnackbar() {
    if (currentSnackbar) {
      currentSnackbar.remove();
      currentSnackbar = null;
    }
  }
  function showSnackbar(items, currentUser, { isStale = false } = {}) {
    destroySnackbar();
    if (!items.length) return;
    const wrap = document.createElement("div");
    currentSnackbar = wrap;
    Object.assign(wrap.style, {
      position: "fixed", right: "120px", bottom: "16px", zIndex: 2147483647,
      maxWidth: "360px", background: "#1f1f1f", color: "#fff", borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.3)", overflow: "hidden",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSize: "14px", lineHeight: 1.35, opacity: 0, transform: "translateY(8px)",
      transition: "opacity 200ms ease, transform 200ms ease"
    });
    const header = document.createElement("div");
    header.textContent = isStale ? "Recent edits for this page (cached)" : "Recent edits for this page";
    Object.assign(header.style, {
      padding: "10px 12px", fontWeight: 600, background: "#2a2a2a",
      borderBottom: "1px solid rgba(255,255,255,0.08)"
    });
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, { all: "unset", cursor: "pointer", float: "right",
      fontSize: "18px", lineHeight: 1, marginTop: "-2px", marginRight: "-2px",
      padding: "4px 8px", color: "#bbb" });
    closeBtn.addEventListener("click", () => {
      wrap.style.opacity = "0"; wrap.style.transform = "translateY(8px)";
      setTimeout(() => destroySnackbar(), 200);
    });
    header.appendChild(closeBtn);
    const list = document.createElement("div");
    Object.assign(list.style, { maxHeight: "180px", overflowY: "auto", padding: "6px 12px" });
    list.tabIndex = 0;
    items.forEach(({ userName, date, dateOnly, detail, meta }) => {
      // Filter out reminder, connections, and LocationInvocation usernames
      if (userName && (
        userName.toLowerCase() === 'reminder' ||
        userName.toLowerCase() === 'connections' ||
        userName.toLowerCase() === 'locationinvocation' ||
        userName.toLowerCase() === 'invocation' ||
        userName.toLowerCase() === 'invocations' ||
        userName.toLowerCase() === 'locationinvocations'
      )) {
        return;
      }
      const you = currentUser && userName && userName.trim().toLowerCase() === currentUser.trim().toLowerCase();
      const who = you ? "You" : userName || "Someone";
      const value = scoreEditValue(meta);
      const row = document.createElement("div");
      const message = detail
        ? `${who} ${detail} ${timeAgo(date, dateOnly)}.`
        : `${who} edited this ${timeAgo(date, dateOnly)}.`;
      Object.assign(row.style, {
        padding: "6px 0",
        borderBottom: "1px dashed rgba(255,255,255,0.08)",
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
        borderLeft: `3px solid ${value.border}`,
        paddingLeft: "8px"
      });
      const text = document.createElement("div");
      text.textContent = message;
      text.style.flex = "1";
      text.style.minWidth = "0";
      row.appendChild(text);
      const badge = document.createElement("span");
      badge.textContent = value.badgeText || `${value.label} ${value.score}`;
      Object.assign(badge.style, {
        background: value.color,
        color: value.text,
        borderRadius: "999px",
        padding: "2px 6px",
        fontSize: "10px",
        fontWeight: "700",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap"
      });
      row.appendChild(badge);
      list.appendChild(row);
    });
    const hint = document.createElement("div");
    hint.textContent = isStale
      ? "Showing cached results. Hover to pause. Scroll for more."
      : "Hover to pause. Scroll for more.";
    Object.assign(hint.style, {
      padding: "8px 12px", color: "#bbb", fontSize: "12px", borderTop: "1px solid rgba(255,255,255,0.08)"
    });
    wrap.appendChild(header);
    wrap.appendChild(list);
    wrap.appendChild(hint);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => { wrap.style.opacity = "1"; wrap.style.transform = "translateY(0)"; });
    let t = setTimeout(() => {
      wrap.style.opacity = "0"; wrap.style.transform = "translateY(8px)";
      setTimeout(() => destroySnackbar(), 200);
    }, 6000);
    const stop = () => { if (t) { clearTimeout(t); t = null; } };
    const start = () => {
      stop();
      t = setTimeout(() => {
        wrap.style.opacity = "0"; wrap.style.transform = "translateY(8px)";
        setTimeout(() => destroySnackbar(), 200);
      }, 2500);
    };
    wrap.addEventListener("mouseenter", stop);
    wrap.addEventListener("mouseleave", start);
  }
  async function fetchAndRender() {
    // Only work on location pages
    if (!/^\/team\/location\//.test(location.pathname)) {
      destroySnackbar();
      lastRenderedPath = null;
      lastFetchOk = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      retryCount = 0;
      return;
    }
    if (fetchInFlight) return;
    const pagePath = location.pathname.replace(/\/+$/, "");
    if (pagePath === lastRenderedPath && lastFetchOk) return; // avoid duplicate fetch on same URL
    lastRenderedPath = pagePath;
    let all = null;
    let usedCache = false;
    fetchInFlight = true;
    try {
      const { primaryUrl, fallbackUrl } = buildPageNotesUrls(pagePath);
      let result = primaryUrl
        ? await fetchJsonWithRetry(primaryUrl)
        : { ok: false, error: new Error("Missing page URL") };
      if (!result.ok && fallbackUrl && fallbackUrl !== primaryUrl) {
        result = await fetchJsonWithRetry(fallbackUrl);
      }
      if (result.ok) {
        all = result.data;
        lastFetchOk = true;
        lastGoodNotes = all;
        lastGoodPath = pagePath;
        lastGoodAt = Date.now();
        retryCount = 0;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
      } else {
        lastFetchOk = false;
        const now = Date.now();
        const errorMessage = result.error?.message || String(result.error || 'unknown error');
        if (lastGoodNotes && lastGoodPath === pagePath && (now - lastGoodAt) < FETCH_CACHE_MAX_AGE_MS) {
          all = lastGoodNotes;
          usedCache = true;
          console.warn("[Snackbar] fetch failed, using cached data:", errorMessage);
        } else {
          console.warn("[Snackbar] fetch failed:", errorMessage);
          scheduleSnackbarRetry();
          destroySnackbar();
          return;
        }
        scheduleSnackbarRetry();
      }
    } finally {
      fetchInFlight = false;
    }
    if (!all || typeof all !== "object") {
      lastFetchOk = false;
      scheduleSnackbarRetry();
      return;
    }
    const matchedUserMap = all && typeof all === "object" ? all : null;
    if (!matchedUserMap || !Object.keys(matchedUserMap).length) { destroySnackbar(); return; }
    const items = normalizeRecordsForTopKey(matchedUserMap);
    if (!items.length) { destroySnackbar(); return; }
    const currentUser = await getCurrentUserName();
    showSnackbar(items, currentUser, { isStale: usedCache });
  }
  // --- SPA navigation listeners ---
  function onRouteChange() { fetchAndRender(); }
  // Patch history to emit events
  ["pushState", "replaceState"].forEach((m) => {
    const orig = history[m];
    history[m] = function(...args) {
      const ret = orig.apply(this, args);
      window.dispatchEvent(new Event("spa:navigation"));
      return ret;
    };
  });
  window.addEventListener("spa:navigation", onRouteChange);
  window.addEventListener("popstate", onRouteChange);
  // Optional: re-check if the same path updates in place (e.g., content changes without URL change)
  const mo = new MutationObserver(() => {
    // If you want periodic refresh on same route, you can call fetchAndRender() here,
    // but to avoid spam we won't. Uncomment if needed:
    // fetchAndRender();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  // Kick off initially
  fetchAndRender();
})();
