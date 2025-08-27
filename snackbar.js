(() => {
  if (!/^https:\/\/gogetta\.nyc\/team\/location\//.test(location.href)) return;

  const baseURL = window.gghost?.baseURL; // e.g. "https://.../locationNotes/notes"
  if (!baseURL) return;
  const jsonUrl = `${baseURL}locationNotes.json`;

  let lastRenderedPath = null;
  let currentSnackbar = null;

  const getCurrentUserName = async () => {
    if (window.gghostUserName) return window.gghostUserName;
    if (typeof window.getUserNameSafely === "function") {
      try { return await window.getUserNameSafely(); } catch {}
    }
    return "";
  };
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

  function normalizeRecordsForTopKey(userMap) {
    // Expect: { userKey: { dateKey: noteVal, ... }, ... }
    const items = [];
    if (!userMap || typeof userMap !== "object") return items;

    for (const [userKey, dateMap] of Object.entries(userMap)) {
      if (!dateMap || typeof dateMap !== "object") continue;

      for (const [dateKey, noteVal] of Object.entries(dateMap)) {
        const info = parseWhen(dateKey, noteVal);
        if (!info) continue;
        const userName = userKey.replace(/-futurenote$/i, "");
        items.push({ userName, date: info.date, dateOnly: info.dateOnly });
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

  function showSnackbar(items, currentUser) {
    destroySnackbar();
    if (!items.length) return;

    const wrap = document.createElement("div");
    currentSnackbar = wrap;

    Object.assign(wrap.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: 2147483647,
      maxWidth: "360px", background: "#1f1f1f", color: "#fff", borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.3)", overflow: "hidden",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSize: "14px", lineHeight: 1.35, opacity: 0, transform: "translateY(8px)",
      transition: "opacity 200ms ease, transform 200ms ease"
    });

    const header = document.createElement("div");
    header.textContent = "Recent edits for this page";
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

    items.forEach(({ userName, date, dateOnly }) => {
      const you = currentUser && userName && userName.trim().toLowerCase() === currentUser.trim().toLowerCase();
      const who = you ? "You" : userName || "Someone";
      const row = document.createElement("div");
      row.textContent = `${who} edited this ${timeAgo(date, dateOnly)}.`;
      Object.assign(row.style, { padding: "6px 0", borderBottom: "1px dashed rgba(255,255,255,0.08)" });
      list.appendChild(row);
    });

    const hint = document.createElement("div");
    hint.textContent = "Hover to pause. Scroll for more.";
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
      return;
    }
    if (location.pathname === lastRenderedPath) return; // avoid duplicate fetch on same URL
    lastRenderedPath = location.pathname;

    let res;
    try {
      res = await fetch(jsonUrl, { cache: "no-store" });
    } catch (e) {
      console.warn("[Snackbar] fetch failed:", e);
      return;
    }
    if (!res.ok) return;
    const all = await res.json();
    if (!all || typeof all !== "object") return;

    let matchedUserMap = null;
    for (const [topKey, userMap] of Object.entries(all)) {
      if (!userMap || typeof userMap !== "object") continue;
      if (keyMatchesPage(topKey)) { matchedUserMap = userMap; break; }
    }
    if (!matchedUserMap) { destroySnackbar(); return; }

    const items = normalizeRecordsForTopKey(matchedUserMap);
    if (!items.length) { destroySnackbar(); return; }

    const currentUser = await getCurrentUserName();
    showSnackbar(items, currentUser);
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
