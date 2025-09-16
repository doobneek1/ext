  console.log('🚀 GGHOST.JS LOADING - URL:', window.location.href);
  let globalButtonDropdown = null;
  const buttonActions = [];

// Check for extension context validity
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
  console.warn('Extension context may be invalidated');
}

const NOTE_API = "https://locationnote1-iygwucy2fa-uc.a.run.app";
window.gghost = window.gghost || {};
window.gghost.NOTE_API = NOTE_API;
const baseURL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/";
window.gghost.baseURL = baseURL;

// Shared Cognito authentication utilities
window.gghost = window.gghost || {};
console.log('[gghost.js] Script loaded, setting up getCognitoTokens');
window.gghost.getCognitoTokens = function getCognitoTokens() {
  try {
    const storage = localStorage;
    let accessToken = null;
    let idToken = null;
    let username = null;

    // Debug: Log all localStorage keys
    console.log('[getCognitoTokens] Scanning localStorage...');
    const cognitoKeys = [];
    
    // Find Cognito tokens by scanning localStorage
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('CognitoIdentityServiceProvider.')) {
        cognitoKeys.push(key);
        if (key.includes('.accessToken')) {
          accessToken = storage.getItem(key);
          console.log('[getCognitoTokens] Found accessToken');
        } else if (key.includes('.idToken')) {
          idToken = storage.getItem(key);
          console.log('[getCognitoTokens] Found idToken');
        } else if (key.includes('.LastAuthUser')) {
          username = storage.getItem(key);
          console.log('[getCognitoTokens] Found username:', username);
        }
      }
    }

    console.log('[getCognitoTokens] Found Cognito keys:', cognitoKeys);
    console.log('[getCognitoTokens] Result:', { 
      hasAccessToken: !!accessToken, 
      hasIdToken: !!idToken, 
      username 
    });

    return { accessToken, idToken, username };
  } catch (error) {
    console.warn('[getCognitoTokens] Error accessing localStorage:', error);
    return { accessToken: null, idToken: null, username: null };
  }
};

// Local reference for this file
const getCognitoTokens = window.gghost.getCognitoTokens;

function getAuthHeaders() {
  console.log('[getAuthHeaders] Getting auth headers...');
  const { accessToken, idToken } = getCognitoTokens();
  if (accessToken) {
    console.log('[getAuthHeaders] Using JWT token');
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
  }
  console.log('[getAuthHeaders] No JWT token found, using plain headers');
  return { 'Content-Type': 'application/json' };
}

// Expose getAuthHeaders on window.gghost for use by autoClicker.js
window.gghost.getAuthHeaders = getAuthHeaders;

function getCurrentUsername() {
  const { username } = getCognitoTokens();
  return username || 'doobneek'; // fallback to default
}

// Helper function for authenticated NOTE_API calls
async function postToNoteAPI(payload) {
  console.log('[postToNoteAPI] Making authenticated API call with payload:', payload);
  const headers = getAuthHeaders();
  console.log('[postToNoteAPI] Using headers:', headers);
  
  const response = await fetch(NOTE_API, {
    method: "POST",
    headers: headers,
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  
  console.log('[postToNoteAPI] Response status:', response.status);
  return response;
}
function normalizeOrgName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '') 
    .trim();
}
  const ns = "http://www.w3.org/2000/svg";

  const label = document.createElementNS(ns, "text");

        const today = new Date().toISOString().slice(0, 10); 
async function fetchValidationStats(uuid) {
  const url = `${baseURL}locationNotes/${uuid}/stats.json`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const data = (await r.json()) || {};
  // Allow either validatedAt or lastValidated
  const dates = [];
  for (const k in data) {
    const v = data[k];
    const iso = v?.validatedAt || v?.lastValidated || null;
    if (!iso) continue;
    const d = new Date(iso);
    if (!isNaN(d)) dates.push(d);
  }
  return dates.sort((a, b) => a - b);
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthKeyFromParts(y, m) {
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}`;
}

function parseMonthKey(k) {
  const [y, m] = k.split("-").map(Number);
  return { y, m: m - 1 }; // JS month 0..11
}

function incMonth(y, m, n = 1) {
  const d = new Date(y, m + n, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

function monthsBetween(aKey, bKey) {
  const a = parseMonthKey(aKey);
  const b = parseMonthKey(bKey);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

function formatMonthShort(k) {
  const { y, m } = parseMonthKey(k);
  return new Date(y, m, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  }); // e.g. "Apr 25"
}
function buildAdaptiveMonthBuckets(dates, limit = 12) {
  if (!Array.isArray(dates) || dates.length === 0) return [];

  const counts = new Map();
  for (const d of dates) {
    const k = monthKey(d); // assumes you already have monthKey(d)
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  const keys = Array.from(counts.keys()).sort();
  const firstKey = keys[0];
  const lastKey = keys[keys.length - 1];

  const span = monthsBetween(firstKey, lastKey) + 1;

  let startKey, endKey;
  if (span <= limit) {
    startKey = firstKey;
    endKey = lastKey;
  } else {
    const { y, m } = parseMonthKey(lastKey);
    const start = incMonth(y, m, -(limit - 1));
    startKey = monthKeyFromParts(start.y, start.m);
    endKey = lastKey;
  }

  const ks = [];
  let cur = parseMonthKey(startKey);
  const end = parseMonthKey(endKey);
  while (true) {
    ks.push(monthKeyFromParts(cur.y, cur.m));
    if (cur.y === end.y && cur.m === end.m) break;
    cur = incMonth(cur.y, cur.m, 1);
  }

  return ks.map(k => ({ key: k, count: counts.get(k) || 0 }));
}


// Optional: cumulative transform (if you want the smooth rising line)
function toCumulative(buckets) {
  let run = 0;
  return buckets.map(b => ({ key: b.key, count: (run += b.count) }));
}

function buildLast12MonthBuckets(dates) {
  // Make a map counts per YYYY-MM
  const counts = new Map();
  for (const d of dates) {
    const key = monthKey(d);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // Build last 12 months ending this month
  const now = new Date();
  const keys = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 11; i >= 0; i--) {
    const k = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    keys.push(monthKey(k));
  }
  return keys.map(k => ({ key: k, count: counts.get(k) || 0 }));
}

function renderValidationChartSVG(buckets, opts = {}) {
  const w = opts.width || 320;
  const h = opts.height || 120;
  const pad = opts.pad || 24;

  const max = Math.max(1, ...buckets.map(b => b.count));
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  // X axis
  const axis = document.createElementNS(ns, "line");
  axis.setAttribute("x1", pad);
  axis.setAttribute("y1", h - pad);
  axis.setAttribute("x2", w - pad);
  axis.setAttribute("y2", h - pad);
  axis.setAttribute("stroke", "#ddd");
  axis.setAttribute("stroke-width", "1");
  svg.appendChild(axis);

  const bw = (w - pad * 2) / buckets.length;

  // Build line points
  const points = buckets.map((b, i) => {
    const x = pad + i * bw + bw / 2;
    const y = h - pad - Math.round(((h - pad * 2) * b.count) / max);
    return [x, y];
  });

  // Line path
  const path = document.createElementNS(ns, "path");
  const d = points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#444");
  path.setAttribute("stroke-width", "2");
  svg.appendChild(path);

  // Small circles on data points
  // Small circles on data points with hover tooltips
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    const bucket = buckets[i];

    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", x);
    c.setAttribute("cy", y);
    c.setAttribute("r", "2.5");
    c.setAttribute("fill", "#444");

    // Tooltip shows on hover
    const title = document.createElementNS(ns, "title");
    title.textContent = `${bucket.key}: ${bucket.count}`;
    c.appendChild(title);

    svg.appendChild(c);
  }


  // Labels
  const first = buckets[0]?.key || "";
  const last = buckets[buckets.length - 1]?.key || "";
const total = buckets[buckets.length - 1]?.count || 0;
label.textContent = `Validations (last 12) — total ${total}`;

  label.setAttribute("x", pad);
  label.setAttribute("y", pad - 8);
  label.setAttribute("font-size", "11");
  label.setAttribute("fill", "#333");
  svg.appendChild(label);

  const leftLabel = document.createElementNS(ns, "text");
  leftLabel.setAttribute("x", pad);
  leftLabel.setAttribute("y", h - 6);
  leftLabel.setAttribute("font-size", "10");
  leftLabel.setAttribute("fill", "#666");
  leftLabel.textContent = first;
  svg.appendChild(leftLabel);

  const rightLabel = document.createElementNS(ns, "text");
  rightLabel.setAttribute("x", w - pad);
  rightLabel.setAttribute("y", h - 6);
  rightLabel.setAttribute("text-anchor", "end");
  rightLabel.setAttribute("font-size", "10");
  rightLabel.setAttribute("fill", "#666");
  rightLabel.textContent = last;
  svg.appendChild(rightLabel);

  return svg;
}


async function addValidationHistoryBadge(readOnlyDiv, uuid) {
  try {
    const dates = await fetchValidationStats(uuid);
    if (!Array.isArray(dates) || dates.length < 2) return;

    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "relative",
      display: "inline-block",
      float: "right",
      margin: "-6px -6px 0 0",
    });

    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Show validation history";
    btn.textContent = "ℹ️";
    Object.assign(btn.style, {
      border: "1px solid #aaa",
      background: "#fff",
      borderRadius: "50%",
      width: "22px",
      height: "22px",
      lineHeight: "18px",
      fontSize: "14px",
      cursor: "pointer",
    });

    const pop = document.createElement("div");
    pop.setAttribute("role", "dialog");
    Object.assign(pop.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      width: "360px",
      padding: "8px",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "6px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      display: "none",
      zIndex: 2147483647,
    });

    // ✅ use adaptive buckets
    const buckets = buildAdaptiveMonthBuckets(dates, 12);
    const shown = toCumulative(buckets); // if you want cumulative view

    const svg = renderValidationChartSVG(shown, {
      width: 340,
      height: 140,
      pad: 28
    });
    pop.appendChild(svg);

    wrap.appendChild(btn);
    readOnlyDiv.prepend(wrap);
    document.body.appendChild(pop);

    function positionPop() {
      const r = btn.getBoundingClientRect();
      const gap = 6;
      const popW = 360;
      const popH = 160;
      let top = Math.min(window.innerHeight - popH - 10, Math.max(10, r.bottom + gap));
      let left = Math.min(window.innerWidth - popW - 10, Math.max(10, r.right - popW));
      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
    }

    let pinned = false;
    function show() {
      positionPop();
      pop.style.display = "block";
    }
    function hide() {
      if (!pinned) pop.style.display = "none";
    }

    btn.addEventListener("mouseenter", show);
    btn.addEventListener("mouseleave", hide);
    pop.addEventListener("mouseenter", () => { if (!pinned) pop.style.display = "block"; });
    pop.addEventListener("mouseleave", hide);
    btn.addEventListener("click", () => {
      pinned = !pinned;
      if (pinned) show(); else hide();
    });
    window.addEventListener("scroll", () => { if (pop.style.display === "block") positionPop(); }, { passive: true });
    window.addEventListener("resize", () => { if (pop.style.display === "block") positionPop(); });

  } catch (err) {
    console.warn("[ValidationHistory] Failed to mount badge:", err);
  }
}


async function recordLocationStat(uuid, lastValidated) {
  if (!lastValidated) return;

  const base = `${baseURL}/locationNotes/${uuid}/stats.json`;

  // 1) Fetch current stats to check for duplicates
  const existingRes = await fetch(base);
  const existing = await existingRes.json() || {};

  const alreadyExists = Object.values(existing).some(
    entry => entry.lastValidated === lastValidated
  );

  if (alreadyExists) {
    console.log("[YP] ℹ️ Stat already recorded, skipping");
    return;
  }

  // 2) POST a new child (push style)
  const body = JSON.stringify({
    lastValidated,
  });

  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

  if (!res.ok) {
    console.warn("[YP] ❌ Failed to write stat:", await res.text());
  } else {
    console.log("[YP] ✅ Stat recorded");
  }
}

async function maybeRecordValidation(uuid, data) {
  try {
    const lastValidated = data.last_validated_at || null;
    if (lastValidated) {
      await recordLocationStat(uuid, lastValidated); // same helper as before
    }
  } catch (e) {
    console.warn("[YPButton] ⚠️ Could not record validation:", e);
    // Don't throw - this is a non-critical operation
  }

}
function toCumulative(buckets) {
  let run = 0;
  return buckets.map(b => {
    run += b.count || 0;
    return { ...b, count: run };
  });
}

// Posts a normal note from a site-visit record
async function postNoteFromSiteVisit({ uuid, NOTE_API, rec }) {
  if (!rec || !rec.meta) return;

  const userName = getCurrentUsername();
  const svNote = (typeof rec.notes === 'string' && rec.notes.trim()) ? rec.notes.trim() : "";
  const finalNote = `${userName} competed this Site Visit, ${svNote} `;

  const res = await postToNoteAPI({
    uuid,
    userName,
    date: today,   // past note
    note: finalNote
  });
  await checkResponse(res, "Posting past site-visit note");
}

async function fetchSiteVisitRecord(uuid) {
  const url = `${baseURL}/siteVisits/${uuid}.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`SiteVisit fetch failed: ${r.status}`);
  return await r.json(); // null if not present
}



// Usage:

// Simple overlay with an iframe to add a site-visit request on doobneek.org
// Replace your current showSiteVisitEmbed with this version
function showSiteVisitEmbed({ uuid, onClose = () => {} }) {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000,
    // NEW: stop scroll chaining to the page
    overscrollBehavior: 'contain',
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    position: 'fixed', top: '8%', left: '50%', transform: 'translateX(-50%)',
    width: '860px', height: '70vh', background: '#fff', border: '2px solid #000',
    borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    // NEW: also contain overscroll at the modal level
    overscrollBehavior: 'contain',
  });

  const bar = document.createElement('div');
  Object.assign(bar.style, {
    padding: '8px 12px', background: '#eee', borderBottom: '1px solid #ccc',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
  });
  bar.textContent = 'Add site visit';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.onclick = cleanup;
  bar.appendChild(closeBtn);

  const nonce = crypto?.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint32Array(2))).map(n => n.toString(36)).join('')
    : String(Date.now());

  const src = `http://localhost:3210/embed?uuid=${encodeURIComponent(uuid)}&mode=siteVisit&nonce=${encodeURIComponent(nonce)}`;
  const iframe = document.createElement('iframe');
  Object.assign(iframe, { src, allow: "clipboard-read; clipboard-write" });
  Object.assign(iframe.style, {
    border: '0', width: '100%', height: '100%',
    // NEW: ensure the iframe itself can scroll and stops scroll chaining
    overscrollBehavior: 'contain',
    // NEW: allow programmatic focus for wheel/keyboard scroll
    outline: 'none'
  });
  // NEW: make it focusable & focus it so PageUp/PageDown/space/arrow keys go here
  iframe.tabIndex = 0;

  const EMBED_ORIGIN = new URL(src).origin;

  modal.appendChild(bar);
  modal.appendChild(iframe);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // NEW: lock background scroll (both <html> and <body>)
  const prevHtmlOverflow = document.documentElement.style.overflow;
  const prevBodyOverflow = document.body.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  // NEW: focus the iframe after it’s in the DOM
  setTimeout(() => {
    try { iframe.focus(); } catch {}
  }, 0);

  // NEW: prevent wheel/touch from scrolling the underlying page when pointer is on overlay header
  // (wheel events do not cross iframe boundaries, so this won’t block scrolling *inside* the iframe)
  const blockScroll = (e) => {
    // Allow scroll if the event target is inside the iframe element itself (the event won’t bubble from inside the iframe doc)
    if (e.target === iframe) return;
    e.preventDefault();
  };
  overlay.addEventListener('wheel', blockScroll, { passive: false });
  overlay.addEventListener('touchmove', blockScroll, { passive: false });

  function onMessage(e) {
    if (e.source !== iframe.contentWindow) return;
    if (e.origin !== EMBED_ORIGIN) return;
    const { type, payload } = e.data || {};
    if (type === "REQUEST_CREDS") {
      const ok = !payload?.nonce || payload.nonce === nonce;
      if (!ok) return;
      
      const { accessToken, idToken, username } = getCognitoTokens();
      iframe.contentWindow.postMessage(
        { type: "CREDS", payload: { username, accessToken, idToken, nonce } },
        EMBED_ORIGIN
      );
    } else if (type === "CLOSE_EMBED") {
      cleanup();
    }
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }

  function cleanup() {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('keydown', onKey);
    overlay.removeEventListener('wheel', blockScroll);
    overlay.removeEventListener('touchmove', blockScroll);
    // restore scroll lock
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
    overlay.remove();
    onClose();
  }

  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKey);
}



// Injects the Site Visit UI *inside* the read-only notes panel.
async function injectSiteVisitUI({
  parentEl, /* readOnlyDiv */
  uuid,
  userName,
  NOTE_API,
  today,
  done
}) {
  try {
    // Remove prior banner if re-rendered
    parentEl.querySelector('#sitevisit-banner')?.remove();

    // --- Helpers ------------------------------------------------------------
    function normalizeSiteVisitRecord(raw, uuid) {
      // If the caller fetched the whole branch and it's keyed by uuid
      let rec = raw && raw[uuid] ? raw[uuid] : raw;
      if (!rec || typeof rec !== 'object') return null;

      // Ensure meta exists, coerce done to boolean
      rec.meta = rec.meta || {};
      const dv = rec.meta.done;
      rec.meta.done = dv === true || dv === 'true' || dv === 1 ? true
                   : dv === false || dv === 'false' || dv === 0 ? false
                   : Boolean(dv); // fallback

      // Ensure updatedAt is usable
      if (!rec.meta.updatedAt) rec.meta.updatedAt = new Date().toISOString();

      // Notes may be an object keyed by push IDs
      if (rec.notes && typeof rec.notes === 'object' && !Array.isArray(rec.notes)) {
        // leave as-is
      }
      return rec;
    }

    function getLatestNoteTextFromObjectNotes(notesObj) {
      if (!notesObj || typeof notesObj !== 'object') return '';
      const entries = Object.entries(notesObj);
      if (entries.length === 0) return '';
      entries.sort((a, b) => {
        const da = Date.parse(a[1]?.date || 0);
        const db = Date.parse(b[1]?.date || 0);
        return da - db;
      });
      const last = entries[entries.length - 1];
      return (last?.[1]?.text || '').trim();
    }

    async function postNoteFromSiteVisit({ uuid, NOTE_API, rec }) {
      // Prefer the latest object note text if present
      const latestObjNote = getLatestNoteTextFromObjectNotes(rec?.notes);
      const note = latestObjNote
        ? `[Site Visit] ${latestObjNote}`
        : `[Site Visit] Completed`;

      const userName = getCurrentUsername();
      const res = await postToNoteAPI({
        uuid,
        userName,
        date: (typeof today === 'string' && today) ? today : new Date().toISOString(),
        note
      });
      if (!res.ok) throw new Error("NOTE_API post failed");
      return res;
    }

    // --- Fetch + normalize --------------------------------------------------
    const raw = await fetchSiteVisitRecord(uuid);
    const rec = normalizeSiteVisitRecord(raw, uuid);

    // Build banner
    const banner = document.createElement('div');
    banner.id = 'sitevisit-banner';

    if (rec?.meta?.done === false) {
      // Active site-visit request exists

      // Title / info
      const info = document.createElement('div');
      info.style.marginTop = '4px';
      const updated = new Date(rec.meta.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit"
      });
      info.textContent = `Marked for site visit ${rec.meta.userName || userName || ''} on ${updated}`;
      banner.appendChild(info);

      // Show the latest previous note (object notes)
      const noteText = getLatestNoteTextFromObjectNotes(rec.notes);
      if (noteText) {
        const prevNote = document.createElement("div");
        prevNote.style.marginTop = "4px";
        prevNote.style.fontStyle = "italic";
        prevNote.textContent = `Previous note: ${noteText}`;
        banner.appendChild(prevNote);
      }

      if (done !== true) {
        // ========= OLD VERSION: Checkbox, no embedding =========

        // Back-compat: If rec.notes had been a string in some old records
        if (typeof rec.notes === 'string' && rec.notes.trim()) {
          const svNote = document.createElement('div');
          svNote.style.marginTop = '6px';
          svNote.style.fontStyle = 'italic';
          svNote.textContent = `Note: ${rec.notes}`;
          banner.appendChild(svNote);
        }

        const chkWrap = document.createElement('label');
        chkWrap.style.display = 'inline-flex';
        chkWrap.style.alignItems = 'center';
        chkWrap.style.gap = '6px';
        chkWrap.style.marginTop = '8px';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        const chkText = document.createTextNode(' Done?');

        chkWrap.appendChild(chk);
        chkWrap.appendChild(chkText);
        banner.appendChild(chkWrap);

        chk.addEventListener('change', async () => {
          if (!chk.checked) return;

          try {
            // --- 1) Flip the done flag directly in RTDB ---
            async function flipDone(uuid) {
              const url = `${baseURL}/siteVisits/${uuid}/meta/done.json`;
              const res = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(true)
              });
              if (!res.ok) throw new Error("Failed to flip done flag");
            }

            await flipDone(uuid);

            // --- 2) Post a note to NOTE_API (use latest object-note if any) ---
            await postNoteFromSiteVisit({ uuid, NOTE_API, rec });

            // --- 3) UI cleanup ---
            chk.disabled = true;
            chkWrap.textContent = "Thanks — recorded and cleared.";
            setTimeout(() => banner.remove(), 1200);

          } catch (err) {
            console.error("[SiteVisit] Failed to mark done:", err);
            alert("Failed to record completion.");
            chk.checked = false;
          }
        });

        // ========= END OLD VERSION =========
      } else {
        // ========= NEW VERSION: Inline editor via embed (when done === true) =========
        const editorWrap = document.createElement('div');

        const nonce = crypto?.getRandomValues
          ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
          : String(Date.now());

        const src = `http://localhost:3210/embed?uuid=${encodeURIComponent(uuid)}&mode=siteVisit&nonce=${encodeURIComponent(nonce)}`;
        const iframe = document.createElement('iframe');
        Object.assign(iframe.style, { width: '100%', height: '30px', display: 'block' });
        iframe.src = src;
        editorWrap.appendChild(iframe);

        const EMBED_ORIGIN = new URL(src).origin;

        async function onMessage(e) {
          if (e.source !== iframe.contentWindow) return;
          if (e.origin !== EMBED_ORIGIN) return;

          const { type, payload } = e.data || {};

          if (type === 'REQUEST_CREDS') {
            const ok = !payload?.nonce || payload.nonce === nonce;
            if (!ok) return;
            iframe.contentWindow.postMessage(
              { type: 'CREDS', payload: { userName, nonce } },
              EMBED_ORIGIN
            );

          } else if (type === 'CLOSE_EMBED') {
            try {
              const latestRaw = await fetchSiteVisitRecord(uuid);
              const latest = normalizeSiteVisitRecord(latestRaw, uuid);
              if (latest?.meta?.done === true) {
                await postNoteFromSiteVisit({
                  uuid,
                  NOTE_API,
                  rec: latest
                });
              }
            } catch (err) {
              console.warn("[SiteVisit] Could not convert site-visit into past note:", err);
            }

            cleanupInline();
            // Re-render with done:true
            injectSiteVisitUI({
              parentEl,
              uuid,
              userName,
              NOTE_API,
              today,
              done: true
            });
          }
        }

        function onKey(e) {
          if (e.key === 'Escape') cleanupInline();
        }

        function cleanupInline() {
          window.removeEventListener('message', onMessage);
          window.removeEventListener('keydown', onKey);
          editorWrap.remove();
        }

        window.addEventListener('message', onMessage);
        window.addEventListener('keydown', onKey);
        banner.appendChild(editorWrap);
        // ========= END NEW VERSION =========
      }

    } else {
      // No active record: show action button
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';

      const btn = document.createElement('button');
      btn.textContent = done ? `Thanks, ${userName}` : "Visit this location";
      Object.assign(btn.style, {
        padding: '6px 10px',
        border: '1px solid #000',
        borderRadius: '4px',
        background: '#fff',
        cursor: 'pointer'
      });

      btn.addEventListener('click', () => {
        showSiteVisitEmbed({
          uuid,
          onClose: () => {
            injectSiteVisitUI({
              parentEl,
              uuid,
              userName,
              NOTE_API,
              today,
              done: false
            });
          }
        });
      });

      row.appendChild(btn);
      banner.appendChild(row);
    }

    // Insert at the top of the read-only notes
    parentEl.prepend(banner);
  } catch (e) {
    console.warn('[SiteVisit] Skipping banner due to error:', e);
  }
}

const editableDiv = document.createElement("div");

function sanitizeOrgNameForKey(name) {
  if (typeof name !== "string") return "";
  // Remove illegal symbols (anything not alphanumeric, space, hyphen)
  let cleaned = name.replace(/[^a-zA-Z0-9 \-]/g, "");
  // Trim and collapse spaces
  cleaned = cleaned.trim().replace(/\s+/g, " ");
  // Encode apostrophes
  return cleaned;
}

function uuidv() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function resetForm() {
  // text inputs
  orgNameInput.value = "";
  phoneInput.value = "";
  websiteInput.value = "";
  emailInput.value = "";
  noteArea.value = "";

  // address input + chips
  addrInput.value = "";
  addresses.length = 0;           // wipe array
  renderChips();                  // refresh chips UI

  // recompute key line + clear existing list
  currentKey = "";
  keyLine.textContent = "Key: —";
  existingList.innerHTML = "(No notes yet)";

  // focus for fast data entry
  orgNameInput.focus();
}


async function transferFutureNoteToUUID({ orgKey, sourceUserName, sourceDate, noteText, NOTE_API, locationUuid }) {
  if (!locationUuid) {
    alert("Open a specific GoGetta location first.");
    return;
  }
  await postToNoteAPI({
    uuid: orgKey,
    userName: sourceUserName,
    date: `https://gogetta.nyc/team/location/${sourceDate}`,
    note: null
  }).then(r => checkResponse(r, "Deleting original future/online note"));

  // 2) Write note under real UUID for today, authored by current user
  const currentUser = getCurrentUsername();
  await postToNoteAPI({
    uuid: locationUuid,
    userName: currentUser,
    date: today,
note: `${noteText},${sanitizeOrgNameForKey(decodeURIComponent(sourceDate))},${fromFirebaseKey(sourceUserName)},${decodeURIComponent(orgKey.replace(/-futureNote$/, "").split("_")[1])},` || "(moved from future/online)"
  }).then(r => checkResponse(r, "Transferring note to UUID"));
  editableDiv.innerText=`${noteText},${sanitizeOrgNameForKey(decodeURIComponent(sourceDate))},${fromFirebaseKey(sourceUserName)},${decodeURIComponent(orgKey.replace(/-futureNote$/, "").split("_")[1])},` || "(moved from future/online)"

}
async function openFutureOnlineModal() {
  const userName = window.gghostUserName || await getUserNameSafely();

  // === helpers (scoped) ===

  function normalizeWebsiteHost(url) {
    if (!url) return "";
    try {
      const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);
      return u.hostname.toLowerCase();
    } catch { return String(url || "").trim().toLowerCase(); }
  }
function toFirebaseKey(str) {
  if (typeof str !== "string") return "x";
  return str
    .trim()
    .toLowerCase()
    .replace(/[.#$/\[\]]/g, "_"); // replace forbidden chars with underscore
}

function buildCompositeUuid(website, email, phone) {
  const w = toFirebaseKey(normalizeWebsiteHost(website) || "x");
  const e = toFirebaseKey(email || "x");
  const p = toFirebaseKey(phone || "x");
  return `${w}-${e}-${p}`;
}

  function looksLikeCompositeKey(key) {
    // Accept keys that clearly aren't UUIDs: contain a dot (domain) or '@' (email)
    // and exclude plain UUIDs like 8-4-4-4-12 hex.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    return !isUUID && (key.includes("@") || key.includes("."));
  }
  function getCurrentLocationUuidFromPath() {
    const path = location.pathname;
    const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
    const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
    const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
    return (fullServiceMatch || teamMatch || findMatch)?.[1] || null;
  }
  function validPhone(p){ return !p || /^[0-9()+\-\s]{7,}$/.test(p); }
function validUrl(u) {
  if (!u) return true; // empty allowed
  const s = String(u).trim();
  if (/\s/.test(s)) return false;
  if (/^javascript:|^data:|^file:/i.test(s)) return false;
  try {
    // If missing scheme, add https:// for parsing only
    new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return true;
  } catch {
    return false;
  }
}
  function validEmail(e){ return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  // === Overlay ===
  const overlay = document.createElement('div');
  Object.assign(overlay.style, { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000 });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)',
    width: '760px', maxHeight: '80%', overflow: 'hidden',
    background: '#fff', border: '2px solid #000', borderRadius: '8px',
    display: 'flex', gap: '16px', padding: '16px', zIndex: 100001
  });

  // Left/form
  const form = document.createElement('div');
  Object.assign(form.style, { flex: '1 1 55%', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto' });
  form.innerHTML = `
    <h3 style="margin:0 0 8px 0;">Add future/online org</h3>
    <label style="font-weight:600">Organization name
      <input id="fo-org-name" type="text" placeholder="e.g., New Example Org" style="width:100%;padding:6px;margin-top:4px;">
    </label>


    <div style="display:grid;grid-template-columns:1fr;gap:6px;padding:8px;border:1px solid #ddd;border-radius:6px;">
      <div style="font-weight:600">At least one required:</div>
      <input id="fo-phone" type="text" placeholder="Phone (digits only)" style="width:100%;padding:6px;">
      <input id="fo-website" type="text" placeholder="Website (https://example.org)" style="width:100%;padding:6px;">
      <input id="fo-email" type="text" placeholder="Email (name@example.org)" style="width:100%;padding:6px;">
    </div>

    <div style="padding:8px;border:1px solid #ddd;border-radius:6px;">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <input id="fo-address-input" type="text" placeholder="Address (add multiple)" style="flex:1;padding:6px;">
        <button id="fo-address-add" type="button" style="padding:6px 10px;border:1px solid #000;border-radius:4px;background:#fff;cursor:pointer;">Add</button>
      </div>
      <div id="fo-address-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
      <div style="font-size:12px;color:#666;margin-top:6px;">Tip: add several addresses. We will concatenate them for storage.</div>
    </div>

    <label style="font-weight:600">Note about the org
      <textarea id="fo-note" placeholder="What should we know?" style="width:100%;height:120px;padding:6px;margin-top:4px;"></textarea>
    </label>

    <div style="display:flex;gap:8px;margin-top:8px;">
      <button id="fo-cancel" type="button" style="padding:8px 12px;border:1px solid #000;border-radius:4px;background:#fff;cursor:pointer;">Cancel</button>
      <button id="fo-save" type="button" style="padding:8px 12px;border:1px solid #000;border-radius:4px;background:#e6ffe6;cursor:pointer;font-weight:700;">Save</button>
    </div>
  `;

  // Right/existing
  const right = document.createElement('div');
  Object.assign(right.style, { flex: '1 1 45%', display: 'flex', flexDirection: 'column' });
  right.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h4 style="margin:0;">Existing future/online leads</h4>
    </div>
    <div id="fo-existing" style="flex:1 1 auto;overflow:auto;border:1px solid #ddd;border-radius:6px;padding:8px;min-height:180px;background:#fafafa;"></div>
  `;

  modal.appendChild(form);
  modal.appendChild(right);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
requestAnimationFrame(() => loadExisting());
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) {
    overlay.remove();
  }
});
  const q = sel => modal.querySelector(sel);
  const orgNameEl    = q('#fo-org-name');
  const phoneEl      = q('#fo-phone');
  const websiteEl    = q('#fo-website');
  const emailEl      = q('#fo-email');
  const addressInput = q('#fo-address-input');
  const addressAdd   = q('#fo-address-add');
  const addressList  = q('#fo-address-list');
  const noteEl       = q('#fo-note');
  const cancelBtn    = q('#fo-cancel');
  const saveBtn      = q('#fo-save');
  const refreshBtn   = q('#fo-refresh');
  const existingDiv  = q('#fo-existing');

  const addresses = [];
  function renderAddresses() {
    addressList.innerHTML = '';
    addresses.forEach((addr, idx) => {
      const pill = document.createElement('div');
      pill.textContent = addr;
      Object.assign(pill.style, { padding: '4px 8px', border: '1px solid #000', borderRadius: '999px', background:'#fff', display:'inline-flex', alignItems:'center', gap:'8px' });
      const x = document.createElement('span');
      x.textContent = '×';
      Object.assign(x.style, { cursor: 'pointer', fontWeight: 700 });
      x.onclick = () => { addresses.splice(idx,1); renderAddresses(); };
      pill.appendChild(x);
      addressList.appendChild(pill);
    });
  }

  addressAdd.onclick = () => {
    const v = addressInput.value.trim();
    if (!v) return;
    addresses.push(v);
    addressInput.value = '';
    renderAddresses();
  };

  cancelBtn.onclick = () => overlay.remove();

async function saveFutureLead() {
  const orgName   = orgNameEl.value.trim();
  const phone     = getLast10Digits(phoneEl.value.trim());
  const website   = websiteEl.value.trim();
  const email     = emailEl.value.trim();
  const noteText  = noteEl.value.trim();

  // if address input has text but not yet added, push it
  const addrVal = addressInput.value.trim();
  if (addrVal && !addresses.includes(addrVal)) {
    addresses.push(addrVal);
    renderAddresses();
  }

  if (!orgName) { alert("Organization name is required."); return; }
  if (!phone && !website && !email) { alert("Provide at least one of phone, website, or email."); return; }
  if (!validPhone(phone))   { alert("Phone looks invalid."); return; }
  if (!validUrl(website))   { alert("Website must be a valid link."); return; }
  if (!validEmail(email))   { alert("Email looks invalid."); return; }

  const compositeUuid = `${uuidv()}_${addresses.join(' | ')}-futureNote`;
  const userNameForRecord = buildCompositeUuid(website, email, phone);
  const dateField = `https://gogetta.nyc/team/location/${encodeURIComponent(orgName)}`;

  const payload = {
    uuid: compositeUuid,
    userName: userNameForRecord,
    date: dateField,
    note: noteText || "(no note)"
  };

  try {
    const res = await postToNoteAPI(payload);
    await checkResponse(res, "Saving future/online org");
    await loadExisting();
    orgNameEl.value = "";
    phoneEl.value = "";
    websiteEl.value = "";
    emailEl.value = "";
    noteEl.value = "";
    addressInput.value = ""; // clear
    addresses.splice(0, addresses.length);
    renderAddresses();
  } catch (e) {
    console.error(e);
    alert(e.message || "Failed to save.");
  }
}

  saveBtn.onclick = saveFutureLead;

function decodeCompositeKey(key) {
  // Split into 3 parts: website, email, phone
  const parts = key.split("-");
  while (parts.length < 3) parts.push("x"); // pad if short
  const [w, e, p] = parts.map(v => v.replace(/_/g, ".")); // restore dots
  return { website: w === "x" ? "" : w, email: e === "x" ? "" : e, phone: p === "x" ? "" : p };
}

async function loadExisting() {
  existingDiv.innerHTML = "Loading…";
  try {
    const r = await fetch(`${baseURL}locationNotes.json`);
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    const all = await r.json() || {};

    const cards = [];

    for (const [topKey, userMap] of Object.entries(all)) {
      if (!userMap || typeof userMap !== "object") continue;

      const entries = [];

      for (const [userKey, dateMap] of Object.entries(userMap)) {
        if (!dateMap || typeof dateMap !== "object") continue;

        const isFuture =
          /-futurenote$/i.test(userKey) ||
          /-futurenote$/i.test(topKey) ||
          looksLikeCompositeKey(topKey) ||
          looksLikeCompositeKey(userKey);

        if (!isFuture) continue;

        for (const [dateKey, noteVal] of Object.entries(dateMap)) {
          const noteText = typeof noteVal === "string" ? noteVal : String(noteVal ?? "");
          entries.push({
            topKey,
            userKey,
            dateKey, // org name
            note: noteText
          });
        }
      }

      if (!entries.length) continue;

      // === Card ===
      const card = document.createElement("div");
      Object.assign(card.style, {
        border: "1px solid #ccc",
        borderRadius: "6px",
        background: "#fff",
        padding: "8px",
        marginBottom: "8px"
      });

      // Title
      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.textContent = decodeURIComponent(entries[0].dateKey || entries[0].userKey || topKey);
      card.appendChild(title);

      // Meta (phone/email/website/address) — always try to show
      let website = "", email = "", phone = "", address = "";
      try {
        if (looksLikeCompositeKey(entries[0].userKey)) {
          const decoded = decodeCompositeKey(entries[0].userKey) || {};
          website = decoded.website || "";
          email = decoded.email || "";
          phone = decoded.phone || "";
        }
      } catch (err) {
        console.warn("decodeCompositeKey failed:", err);
      }
      try {
        address = decodeURIComponent(
          entries[0].topKey.replace(/-futurenote$/i, "")
            .split("_").slice(1).join(" ")
        );
      } catch (err) {
        address = "";
      }

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.color = "#555";
      meta.innerHTML = `
        Website: ${escapeHtml(website) || "(none)"}<br>
        Email: ${escapeHtml(email) || "(none)"}<br>
        Phone: ${escapeHtml(phone) || "(none)"}<br>
        Address: ${escapeHtml(address) || "(none)"}
      `;
      card.appendChild(meta);

      // === Entries list ===
      const list = document.createElement("div");
      list.style.marginTop = "6px";

      entries.forEach(entry => {
        const row = document.createElement("div");
        row.style.borderTop = "1px dashed #eee";
        row.style.padding = "6px 0";
        row.innerHTML = `
          <div style="white-space:pre-wrap;margin-top:4px">${escapeHtml(entry.note)}</div>
        `;

        // Action buttons
        const actions = document.createElement("div");
        actions.style.marginTop = "6px";
        actions.style.display = "flex";
        actions.style.flexWrap = "wrap";
        actions.style.gap = "8px";

        const currentUuid = getCurrentLocationUuidFromPath();
        if (currentUuid) {
          const moveHereBtn = document.createElement("button");
          moveHereBtn.textContent = "Move to this location";
          moveHereBtn.style.padding = "4px 6px";
          moveHereBtn.addEventListener("click", async () => {
            if (!confirm(`Move note to current location (${currentUuid})?`)) return;
            try {
              await transferFutureNoteToUUID({
                orgKey: entry.topKey,
                sourceUserName: entry.userKey,
                sourceDate: entry.dateKey,
                noteText: entry.note,
                NOTE_API,
                locationUuid: currentUuid
              });
              await loadExisting();
            } catch (err) {
              console.error(err);
              alert("Failed to move note.");
            }
          });
          actions.appendChild(moveHereBtn);
        }

        const moveOtherWrapper = document.createElement("div");
        moveOtherWrapper.style.display = "flex";
        moveOtherWrapper.style.gap = "4px";
        const linkInput = document.createElement("input");
        linkInput.type = "url";
        linkInput.placeholder = "Paste GoGetta link";
        linkInput.style.flex = "1";
        linkInput.style.minWidth = "140px";

        const moveOtherBtn = document.createElement("button");
        moveOtherBtn.textContent = "Move to link";
        moveOtherBtn.addEventListener("click", async () => {
          const val = linkInput.value.trim();
          const match = val.match(/\/location\/([a-f0-9-]{12,})/);
          if (!match) {
            alert("Invalid GoGetta location link.");
            return;
          }
          const targetUuid = match[1];
          if (!confirm(`Move note to location: ${targetUuid}?`)) return;
          try {
            await transferFutureNoteToUUID({
              orgKey: entry.topKey,
              sourceUserName: entry.userKey,
              sourceDate: entry.dateKey,
              noteText: entry.note,
              NOTE_API,
              locationUuid: targetUuid
            });
            await loadExisting();
          } catch (err) {
            console.error(err);
            alert("Failed to move note.");
          }
        });

        moveOtherWrapper.appendChild(linkInput);
        moveOtherWrapper.appendChild(moveOtherBtn);
        actions.appendChild(moveOtherWrapper);

        row.appendChild(actions);
        list.appendChild(row);
      });

      card.appendChild(list);
      cards.push(card);
    }

    existingDiv.innerHTML = cards.length
      ? ""
      : "<i>No future/online leads found.</i>";
    cards.forEach(c => existingDiv.appendChild(c));

  } catch (e) {
    console.error(e);
    existingDiv.innerHTML = `<span style="color:#900">Failed to load.</span>`;
  }
}





}

function getTrafficLightColor(lastValidated) {
  if (!lastValidated) return "#ccc"; 
  const last = new Date(lastValidated);
  const now = new Date();
  const diffInMonths = (now - last) / (1000 * 60 * 60 * 24 * 30);
  if (diffInMonths < 6) return "#4CAF50"; 
  if (diffInMonths < 12) return "#FF9800"; 
  return "#F44336"; 
}
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, match =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]
  );
}
async function checkResponse(response, actionDescription) {
  const errText = await response.text();
  if (!response.ok) {
    if (response.status === 403) {
      alert("⚠️ Incorrect password. Please check your name and password, then refresh the page.");
    } else {
      alert(`❌ ${actionDescription} failed.\n\nPlease check your name and password, then refresh the page.\n\nError: ${errText}`);
    }
    throw new Error(`${actionDescription} failed. Status ${response.status}: ${errText}`);
  }
}


async function fetchLocationDetails(uuid) {
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();

    const lastValidated = data.last_validated_at || null;
    if (lastValidated) {
      await recordLocationStat(uuid, lastValidated);
    }

    // Determine if location is closed based on HolidaySchedules
    const isLocationClosed = (() => {
      if (!Array.isArray(data.Services) || data.Services.length === 0) {
        return false; // No services means we can't determine closure
      }

      // Check if ALL services have closed: true in their HolidaySchedules
      return data.Services.every(service => {
        if (!Array.isArray(service.HolidaySchedules) || service.HolidaySchedules.length === 0) {
          return false; // No holiday schedules means not closed
        }

        // Check if any holiday schedule has closed: true
        return service.HolidaySchedules.some(schedule => schedule.closed === true);
      });
    })();

    return {
      org: data.Organization?.name || "",
      name: data.name || "",
      slug: data.slug || "",
      address: data.address?.street || "",
      city: data.address?.city || "",
      state: data.address?.state || "",
      zip: data.address?.postalCode || "",
      services: Array.isArray(data.Services) ? data.Services.map(s => s.name).filter(Boolean) : [],
      lastValidated,
      isClosed: isLocationClosed
    };
  } catch (err) {
    console.warn("Failed to fetch location:", err);
    return {
      org: "",
      name: "",
      slug: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      services: [],
      isClosed: false
    };
  }
}

let isInConnectionMode = false;
function updateEditablePlaceholder() {
  const editableNoteDiv = document.getElementById("editable-note");
  if (!editableNoteDiv) return;

  const placeholder = "Write your note here...";
  if (editableNoteDiv.textContent.trim() === "") {
    editableNoteDiv.setAttribute("data-placeholder", placeholder);
    editableNoteDiv.classList.add("empty");
  } else {
    editableNoteDiv.removeAttribute("data-placeholder");
    editableNoteDiv.classList.remove("empty");
  }
}

document.addEventListener("input", updateEditablePlaceholder);
document.addEventListener("DOMContentLoaded", updateEditablePlaceholder);

async function toggleConnectionMode() {
  console.log("[gghost.js] toggleConnectionMode called. Current isInConnectionMode:", isInConnectionMode); 
 
  isInConnectionMode = !isInConnectionMode;
  console.log("[gghost.js] isInConnectionMode toggled to:", isInConnectionMode); 
const connectionButton =
  document.getElementById("connection-mode-button") ||
  document.getElementById("notes-toggle-button");
  const readonlyNotesDiv = document.getElementById("readonly-notes");
  const editableNoteDiv = document.getElementById("editable-note"); 
  const liveBtn = Array.from(document.querySelectorAll("button"))
    .find(btn => btn.textContent.includes("Transcribing"));
  const aiBtn = Array.from(document.querySelectorAll("button"))
    .find(btn => btn.textContent.includes("Format with AI"));
  let connectionsDiv = document.getElementById("connected-locations");
  console.log("[gghost.js] connectionButton:", connectionButton);
  console.log("[gghost.js] readonlyNotesDiv:", readonlyNotesDiv);
  console.log("[gghost.js] editableNoteDiv:", editableNoteDiv);
  console.log("[gghost.js] liveBtn:", liveBtn);
  console.log("[gghost.js] aiBtn:", aiBtn);
  console.log("[gghost.js] connectionsDiv (initial):", connectionsDiv);
  if (connectionButton) {
    if (isInConnectionMode) { 
      console.log('[gghost.js] Switching to connection mode.');
      connectionButton.innerText = "Notes";
      if (readonlyNotesDiv) readonlyNotesDiv.style.display = "none"; else console.warn("[gghost.js] readonlyNotesDiv not found for hiding");
      if (editableNoteDiv) editableNoteDiv.style.display = "none"; else console.warn("[gghost.js] editableNoteDiv not found for hiding");
      if (liveBtn) liveBtn.style.display = "none"; else console.warn("[gghost.js] liveBtn not found for hiding");
      if (aiBtn) aiBtn.style.display = "none"; else console.warn("[gghost.js] aiBtn not found for hiding");
      if (connectionsDiv) {
        console.log('[gghost.js] connectionsDiv exists. Ensuring it is in noteWrapper and visible.');
        const noteWrapper = document.getElementById('gg-note-wrapper');
        if (noteWrapper && connectionsDiv.parentNode !== noteWrapper) {
            console.log('[gghost.js] connectionsDiv is not a child of noteWrapper. Appending it.');
            noteWrapper.appendChild(connectionsDiv); 
        }
        connectionsDiv.style.display = "block";
      } else {
        console.log('[gghost.js] connectionsDiv does not exist. Calling showConnectedLocations.');
        await showConnectedLocations(NOTE_API);
        connectionsDiv = document.getElementById("connected-locations"); 
        console.log('[gghost.js] connectionsDiv after showConnectedLocations:', connectionsDiv);
        if (!connectionsDiv) {
          console.error("[gghost.js] FAILED to get connectionsDiv after showConnectedLocations!");
        } else {
          connectionsDiv.style.display = "block"; 
        }
      }
    } else { 
      console.log('[gghost.js] Exiting connection mode.');
      connectionButton.innerText = "Show Other Branches";
      if (readonlyNotesDiv) readonlyNotesDiv.style.display = "block"; else console.warn("[gghost.js] readonlyNotesDiv not found for showing");
      if (editableNoteDiv) editableNoteDiv.style.display = "block"; else console.warn("[gghost.js] editableNoteDiv not found for showing");
      if (liveBtn) liveBtn.style.display = "inline-block"; else console.warn("[gghost.js] liveBtn not found for showing");
      if (aiBtn) aiBtn.style.display = "inline-block"; else console.warn("[gghost.js] aiBtn not found for showing");
      if (connectionsDiv) {
        console.log('[gghost.js] Hiding connectionsDiv.');
        connectionsDiv.style.display = "none"; 
      } else {
        console.warn('[gghost.js] connectionsDiv not found when trying to hide in notes view.');
      }
    }
  } else {
    console.warn('[gghost.js] Connection mode button (ID: connection-mode-button) not found!');
  }
}
function toggleGroupVisibility(groupName) {
  const content = document.getElementById(`${groupName}-group-content`);
const header = document.querySelector(`#${CSS.escape(groupName)}-group-container h4`);
  if (!content) {
    console.warn(`[toggleGroupVisibility] Content element not found for group: ${groupName}-group-content`);
    return;
  }
  if (!header) {
    console.warn(`[toggleGroupVisibility] Header element not found for group: ${groupName}-group-container h4`);
  }
  console.log(`[toggleGroupVisibility] Toggling group: ${groupName}. Current display: ${content.style.display}`);
  if (content.style.display === "none" || content.style.display === "") { 
    content.style.display = "block";
    if (header) header.innerText = `▼ ${groupName}`;
    console.log(`[toggleGroupVisibility] Group ${groupName} expanded.`);
  } else {
    content.style.display = "none";
    if (header) header.innerText = `▶ ${groupName}`;
    console.log(`[toggleGroupVisibility] Group ${groupName} collapsed.`);
  }
}
async function addConnectionModeButton() {
  const connectionButton = document.createElement("button");
  connectionButton.id = "connection-mode-button";
  connectionButton.innerText = "Other Locations";  
  connectionButton.style.position = "fixed";
  connectionButton.style.bottom = "20px";
  connectionButton.style.left = "20px";
  connectionButton.style.padding = "10px 16px";
  connectionButton.style.zIndex = 9999;
  connectionButton.addEventListener('click', toggleConnectionMode);
  document.body.appendChild(connectionButton);
}
async function doesSanitizedGroupNameExist(userInput) {
  const firebaseURL = `${baseURL}locationNotes/connections.json`;
  if (!userInput || typeof userInput !== 'string') return false;
  const sanitize = str => str.replace(/\s+/g, '').toLowerCase(); 
  const sanitizedInput = sanitize(userInput);
  try {
    const res = await fetch(firebaseURL);
    if (!res.ok) {
      console.error(`[checkIfGroupExists] Firebase fetch failed: ${res.status}`, await res.text());
      return false;
    }
    const allData = await res.json();
    if (!allData || typeof allData !== 'object') return false;
    return Object.keys(allData).some(groupName => sanitize(groupName) === sanitizedInput);
  } catch (err) {
    console.error('[checkIfGroupExists] Error fetching/parsing group data:', err);
    return false;
  }
}
async function showConnectedLocations(NOTE_API) {
  console.log("[gghost.js] showConnectedLocations called with NOTE_API:", NOTE_API);
  const fullServiceMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
  const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
  const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
  const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];
  console.log("[gghost.js] showConnectedLocations: Extracted UUID:", uuid);
  if (!uuid) {
    console.warn("[gghost.js] showConnectedLocations: No UUID found, returning.");
    return;
  }
  const currentPageLocationDetails = await fetchLocationDetails(uuid);
  const currentPageOrgName = currentPageLocationDetails.org;
  console.log("[gghost.js] showConnectedLocations: Current page org name:", currentPageOrgName);
  const firebaseURL = `${baseURL}locationNotes/connections.json`;
  console.log("[gghost.js] showConnectedLocations: Fetching connections from:", firebaseURL);
  let allData;
  try {
    const res = await fetch(firebaseURL);
    if (!res.ok) {
      console.error("[gghost.js] showConnectedLocations: Firebase fetch failed!", res.status, await res.text());
      return;
    }
    allData = await res.json();
    console.log("[gghost.js] showConnectedLocations: Fetched all connection data:", JSON.parse(JSON.stringify(allData))); 
  } catch (error) {
    console.error("[gghost.js] showConnectedLocations: Error fetching or parsing Firebase data:", error);
    return;
  }
  const allGroups = allData || {};
  const groupNames = Object.keys(allGroups).filter(name =>
  typeof allGroups[name] === "object" &&
  !['reminder'].includes(name) &&
  !/^\d{4}-\d{2}-\d{2}$/.test(name)
);

const suggestibleGroupNames = Object.keys(allGroups).filter(name => {
  const entry = allGroups[name];
  if (typeof entry !== "object") return false;
  if (name === "reminder") return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return false;
  // 👇 exclude groups that already have this uuid
  return !(entry[uuid] === true || entry[uuid] === "true");
});
const groupListDatalist = document.createElement("datalist");
groupListDatalist.id = "group-list-datalist";
suggestibleGroupNames.forEach(name => {
  const option = document.createElement("option");
  option.value = name;
  groupListDatalist.appendChild(option);
});
const groupHasUuid = (groupName) => {
  const entry = allGroups?.[groupName];
  return !!(entry && (entry[uuid] === true || entry[uuid] === "true"));
};
const relevantGroups = Object.entries(allGroups).filter(
  ([groupName, entry]) =>
    typeof entry === "object" &&
    entry[uuid] === true 
);
  console.log("[gghost.js] showConnectedLocations: Relevant groups for UUID", uuid, ":", relevantGroups);
  const connectionsDiv = document.createElement("div");
  connectionsDiv.id = "connected-locations";
  connectionsDiv.style.marginTop = "10px";
  console.log("[gghost.js] showConnectedLocations: Created connectionsDiv:", connectionsDiv);
  const addGroupDiv = document.createElement("div");
  addGroupDiv.style.marginBottom = "15px";
  addGroupDiv.style.padding = "10px";
  addGroupDiv.style.border = "1px solid #ccc";
  addGroupDiv.style.borderRadius = "4px";
  const groupNameInput = document.createElement("input");
  groupNameInput.setAttribute("list", "group-list-datalist");
  groupNameInput.type = "text";
  groupNameInput.placeholder = "Group name";
  groupNameInput.style.width = "calc(50% - 15px)";
  groupNameInput.style.marginRight = "10px";
  groupNameInput.style.padding = "5px";
  const groupLinkInput = document.createElement("input");
  groupLinkInput.type = "url";
  groupLinkInput.placeholder = "New GG URL";
  groupLinkInput.style.width = "calc(50% - 15px)";
  groupLinkInput.style.marginRight = "10px";
  groupLinkInput.style.padding = "5px";
  const addGroupButton = document.createElement("button");
addGroupButton.innerText = "+ New Grp/+ Loc2Grp";
function sanitizeGroupName(rawName) {
  if (!rawName) return "";

  // Trim and collapse spaces
  let name = rawName.trim().replace(/\s+/g, " ");

  // Replace Firebase-forbidden characters with "_"
  name = name.replace(/[.#$/\[\]/]/g, "_");

  // Normalize apostrophes, commas, hyphens, periods into "_" as well
  name = name.replace(/['.,-]/g, "_");

  // Collapse multiple underscores
  name = name.replace(/_+/g, "_");

  // Remove leading/trailing underscores
  name = name.replace(/^_+|_+$/g, "");

  // Truncate to a safe max length (80 chars is plenty)
  if (name.length > 80) {
    name = name.substring(0, 80).trim();
  }

  return name;
}


groupNameInput.addEventListener("input", async () => {
   const currentGroup = sanitizeGroupName(groupNameInput.value);

  // If user typed an existing group that already includes this UUID, block action
  if (groupHasUuid(currentGroup)) {
    addGroupButton.innerText = "Already in this group";
    addGroupButton.disabled = true;
    groupLinkInput.disabled = true;
    return;
  } else {
    addGroupButton.disabled = false;
  }

  const isExisting = await doesSanitizedGroupNameExist(currentGroup);
  if (isExisting) {
    addGroupButton.innerText = "Add This Location to Group";
    groupLinkInput.disabled = true;
    const path = location.pathname;
    const match = path.match(/\/location\/([a-f0-9-]{12,})/);
    const currentUuid = match?.[1];
    if (currentUuid) {
      groupLinkInput.value = `https://gogetta.nyc/team/location/${currentUuid}`;
    }
    addGroupButton.onclick = async () => {
      await addNewGroup(currentGroup, groupLinkInput.value, NOTE_API);
      hideConnectedLocations();
      await showConnectedLocations(NOTE_API);
    };
  } else {
    addGroupButton.innerText = "Create a group";
    groupLinkInput.disabled = false;
    groupLinkInput.value = "";
    addGroupButton.onclick = async () => {
const rawGroupName = groupNameInput.value.trim();
const newGroupName = sanitizeGroupName(rawGroupName);
const newGroupLink = groupLinkInput.value.trim();
const forbidden = ["doobneek", "gavilan","liz","kiesha", "adam"];
const isExistingGroup = await doesSanitizedGroupNameExist(newGroupName);

      // Guard: block invalid/forbidden names and require a valid link for a new group
      if (
        !newGroupName || forbidden.includes(newGroupName) ||
        (!newGroupLink.includes("/location/") && !isExistingGroup)
      ) {
        alert("Please enter a valid group name and link.");
        return;
      }

      await addNewGroup(newGroupName, newGroupLink, NOTE_API);
      hideConnectedLocations();
      await showConnectedLocations(NOTE_API);
    };
  }
});

connectionsDiv.appendChild(groupListDatalist);
  addGroupDiv.appendChild(groupNameInput);
  addGroupDiv.appendChild(groupLinkInput);
  addGroupDiv.appendChild(addGroupButton);
  connectionsDiv.appendChild(addGroupDiv);
const connectionsScrollWrapper = document.createElement("div");
connectionsDiv.style.maxHeight = "400px";
connectionsDiv.style.overflowY = "auto";
connectionsDiv.style.display = "flex";
connectionsDiv.style.flexDirection = "column";
connectionsScrollWrapper.style.flex = "1"; 
connectionsScrollWrapper.style.overflowY = "auto";
connectionsScrollWrapper.style.borderTop = "1px solid #ccc";
connectionsScrollWrapper.style.paddingTop = "10px";
connectionsScrollWrapper.style.paddingBottom = "20px";
connectionsDiv.appendChild(connectionsScrollWrapper);
for (const [groupName, entry] of relevantGroups) {
    if (typeof entry !== "object" || !entry) continue;
    if (['reminder'].includes(groupName)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(Object.keys(entry)[0])) continue;
    const groupContainer = document.createElement("div");
    groupContainer.id = `${groupName}-group-container`;
    groupContainer.style.marginBottom = "10px";
    const header = document.createElement("h4");
    header.innerText = `▼ ${groupName}`;
    header.style.cursor = "pointer";
    header.onclick = () => toggleGroupVisibility(groupName);
    groupContainer.appendChild(header);
    const groupContent = document.createElement("div");
    groupContent.id = `${groupName}-group-content`;
    groupContent.style.display = "block";
   for (const [connectedUuid, status] of Object.entries(entry)) {
  if (!status || status === "false") continue;
  if (!/^[a-f0-9-]{12,}$/.test(connectedUuid)) {
    console.warn(`[showConnectedLocations] Invalid UUID format: ${connectedUuid}`);
    continue;
  }
let locationDisplayElement;
if (connectedUuid === uuid) {
  locationDisplayElement = document.createElement("strong");
  locationDisplayElement.innerText = "This location";
  locationDisplayElement.style.display = "inline-block";
  locationDisplayElement.style.marginRight = "10px";
} else {
  locationDisplayElement = document.createElement("a");
  locationDisplayElement.href = `https://gogetta.nyc/team/location/${connectedUuid}`;
  locationDisplayElement.target = "_blank";
  locationDisplayElement.innerText = `Location ${connectedUuid}`;
  locationDisplayElement.style.display = "inline-block";
  locationDisplayElement.style.marginRight = "10px";
}
const tooltip = document.createElement("div");
tooltip.style.position = "absolute";
tooltip.style.padding = "8px";
tooltip.style.background = "#fff";
tooltip.style.border = "1px solid #ccc";
tooltip.style.borderRadius = "4px";
tooltip.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
tooltip.style.maxWidth = "300px";
tooltip.style.zIndex = "9999";
tooltip.style.display = "none";
tooltip.innerText = "Loading...";
document.body.appendChild(tooltip);
let cache = {};
locationDisplayElement.addEventListener("mouseenter", async (e) => {
  tooltip.style.left = `${e.pageX + 10}px`;
  tooltip.style.top = `${e.pageY + 10}px`;
  tooltip.style.display = "block";
  tooltip.innerText = "Loading…";
  if (cache[connectedUuid]) {
    tooltip.innerHTML = cache[connectedUuid];
    return;
  }
  try {
const data = await fetchLocationDetails(connectedUuid);
const addrParts = [data.address, data.city, data.state, data.zip].filter(Boolean);
const addr = addrParts.join(", ") || "Address not available";
const serviceList = data.services.length
  ? data.services.map(s => `• ${s}`).join("<br>")
  : "No services listed";
    const tooltipContent = `<strong>${addr}</strong><br><br>${serviceList}`;
    cache[connectedUuid] = tooltipContent;
    tooltip.innerHTML = tooltipContent;
  } catch (err) {
    tooltip.innerText = "Error loading details.";
    console.error(`[Tooltip] Failed to load data for ${connectedUuid}:`, err);
  }
});
locationDisplayElement.addEventListener("mouseleave", () => {
  tooltip.style.display = "none";
});
  const disconnectButton = document.createElement("button");
  disconnectButton.innerText = "Disconnect";
  disconnectButton.style.backgroundColor = "red";
  disconnectButton.style.color = "white";
  disconnectButton.style.padding = "2px 6px";
  disconnectButton.addEventListener("click", () =>
    disconnectLocation(groupName, connectedUuid, NOTE_API)
  );
  const locationWrapper = document.createElement("div");
  locationWrapper.style.marginBottom = "8px";
  locationWrapper.appendChild(locationDisplayElement);
  locationWrapper.appendChild(disconnectButton);
  groupContent.appendChild(locationWrapper);
locationDisplayElement.style.borderLeft = `8px solid #ccc`;
locationDisplayElement.style.paddingLeft = "6px";
locationDisplayElement.innerText = connectedUuid === uuid ? "This location" : "Loading...";
fetchLocationDetails(connectedUuid).then(data => {
  const { org: connectedOrgName, name: connectedLocName, lastValidated } = data;
  const trafficColor = getTrafficLightColor(lastValidated);
  locationDisplayElement.style.borderLeft = `8px solid ${trafficColor}`;
  if (connectedUuid === uuid) {
    locationDisplayElement.innerText = "This location";
  } else if (
    normalizeOrgName(currentPageOrgName) &&
    normalizeOrgName(connectedOrgName) &&
    normalizeOrgName(currentPageOrgName) !== normalizeOrgName(connectedOrgName)
  ) {
    locationDisplayElement.innerText = `${connectedOrgName} - ${connectedLocName}`;
  } else {
    locationDisplayElement.innerText = connectedLocName;
  }
}).catch(err => {
  console.error(`[Traffic Light] Failed to fetch details for ${connectedUuid}:`, err);
  locationDisplayElement.innerText = "(Unavailable)";
});
}
    const addLinkToGroupDiv = document.createElement("div");
    addLinkToGroupDiv.style.marginTop = "10px";
    addLinkToGroupDiv.style.paddingTop = "10px";
    addLinkToGroupDiv.style.borderTop = "1px dashed #eee";
    const newLinkInput = document.createElement("input");
    newLinkInput.type = "url";
    newLinkInput.placeholder = "Paste GoGetta link here";
    newLinkInput.style.marginRight = "5px";
    newLinkInput.style.padding = "4px";
    newLinkInput.style.width = "calc(70% - 10px)";
    const addLinkButton = document.createElement("button");
    addLinkButton.innerText = "Add Link";
    addLinkButton.style.padding = "4px 8px";
    addLinkButton.addEventListener("click", async () => {
      const newLink = newLinkInput.value.trim();
      const isValidGoGettaLink = /^https:\/\/(www\.)?gogetta\.nyc\/(team|find)\/location\/[a-f0-9-]{12,}(\/.*)?$/.test(newLink);
if (!isValidGoGettaLink&&!doesSanitizedGroupNameExist(groupName)) {
        alert("This doesn't look like a valid GoGetta location link.");
        return;
      }
      let newConnectedUuid = null;
      try {
        const url = new URL(newLink);
        const pathSegments = url.pathname.split("/").filter(Boolean);
        const locationIndex = pathSegments.findIndex((seg) => seg === "location");
        if (locationIndex !== -1 && pathSegments.length > locationIndex + 1) {
          newConnectedUuid = pathSegments[locationIndex + 1];
        }
      } catch (err) {
        console.warn("Invalid URL format:", newLink, err);
      }
      if ((!newConnectedUuid&&!doesSanitizedGroupNameExist(groupName)) || !/^[a-f0-9-]{12,}$/.test(newConnectedUuid)) {
        alert("Re-check the link.");
        return;
      }
      if ((newConnectedUuid === uuid)&&!doesSanitizedGroupNameExist(groupName)) {
        alert("You cannot link the current location to itself.");
        return;
      }
      if (entry[newConnectedUuid] === "true" || entry[newConnectedUuid] === true) {
        alert("This location is already in the group.");
        return;
      }
      await addUuidToGroup(groupName, uuid, newConnectedUuid, NOTE_API);
      newLinkInput.value = "";
      hideConnectedLocations();
      await showConnectedLocations(NOTE_API);
    });
    addLinkToGroupDiv.appendChild(newLinkInput);
    addLinkToGroupDiv.appendChild(addLinkButton);
    groupContainer.appendChild(groupContent);
connectionsScrollWrapper.appendChild(groupContainer);
    groupContent.appendChild(addLinkToGroupDiv);
  }
  const noteWrapper = document.getElementById("gg-note-wrapper");
  if (noteWrapper) {
    noteWrapper.appendChild(connectionsDiv);
    console.log("[gghost.js] showConnectedLocations: Appended connectionsDiv to gg-note-wrapper.");
  } else {
    console.warn("[gghost.js] [showConnectedLocations] gg-note-wrapper not found. Appending connectionsDiv to body as fallback.");
    document.body.appendChild(connectionsDiv);
  }
  if (!document.getElementById("connected-locations")) {
    console.error("[gghost.js] CRITICAL: connectionsDiv (id: connected-locations) was NOT found in the DOM after attempting to append it in showConnectedLocations!");
  } else {
    console.log("[gghost.js] showConnectedLocations: Successfully created and appended connected-locations div.");
  }
}
function hideConnectedLocations() {
  const connectionsDiv = document.getElementById("connected-locations");
  if (connectionsDiv) {
    console.log('Hiding connected locations...');
    connectionsDiv.remove();
  }
}
async function disconnectLocation(groupName, connectedUuid, NOTE_API) {
  try {
    const payload = {
      uuid: "connections",
      date: `https://gogetta.nyc/team/location/${connectedUuid}`,
      note: false,
      userName: groupName
    };
    const response = await postToNoteAPI(payload);
await checkResponse(response, `Disconnection`);
    hideConnectedLocations();
    await showConnectedLocations(NOTE_API);
  } catch (err) {
    console.error('[Disconnect Error]', err);
  }
}
async function addNewGroup(groupNameFromInput, linkUrlFromInput, NOTE_API) { 
  const path = location.pathname;
  const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
  const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
  const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
  const currentPageUuid = (fullServiceMatch || teamMatch || findMatch)?.[1]; 
  if (!currentPageUuid&&!doesSanitizedGroupNameExist(groupNameFromInput)) {
    alert("Invalid link. Cannot add group.");
    return;
  }
  if (!groupNameFromInput || groupNameFromInput.length < 2) {
    alert("Group name is invalid (must be at least 2 characters).");
    return;
  }
  if ((!linkUrlFromInput || !linkUrlFromInput.includes("/location/"))&&doesSanitizedGroupNameExist(groupNameFromInput)) {
    alert("The provided link does not appear to be a valid GoGetta location link.");
    return;
  }
  const uuidMatchInProvidedLink = linkUrlFromInput.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,})/i);
const trimmedLink = linkUrlFromInput.trim();
const connectedUuidViaLink = uuidMatchInProvidedLink?.[1] || "";
const allowBecauseLinkIsBlank = trimmedLink === "";
const allowBecauseValidUuid = connectedUuidViaLink !== "";
const allowBecauseGroupExists = doesSanitizedGroupNameExist(groupNameFromInput);
if (!allowBecauseLinkIsBlank && !allowBecauseValidUuid && !allowBecauseGroupExists) {
  alert("Please enter a valid GoGetta location link or an existing group name.");
  return;
}
  const locationNotesURL = `${baseURL}locationNotes/${currentPageUuid}.json`;
  try {
    const res = await fetch(locationNotesURL);
    const existingLocationNotes = await res.json();
    if (existingLocationNotes && existingLocationNotes[groupNameFromInput]) {
      alert(`A group named "${groupNameFromInput}" already exists for this location. Please choose a different name or add the link to the existing group.`);
      return;
    }
  } catch (err) {
    console.error("Error checking for existing group name:", err);
    alert("Could not verify if group name is unique. Please try again.");
    return;
  }
const groupExists = await doesSanitizedGroupNameExist(groupNameFromInput);
if (!groupExists) {
  const confirmMsg = `Create group "${groupNameFromInput}" and add the link: ${linkUrlFromInput}?`;
  if (!confirm(confirmMsg)) {
    console.log("[addNewGroup] User cancelled group creation.");
    return;
  }
}
const urlsToSave = [];
const canonicalCurrent = `https://gogetta.nyc/team/location/${currentPageUuid}`;
urlsToSave.push(canonicalCurrent);
const uuidMatch = trimmedLink.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,})/);
const otherUuid = uuidMatch?.[1];
if (otherUuid && otherUuid !== currentPageUuid) {
  const canonicalOther = `https://gogetta.nyc/team/location/${otherUuid}`;
  urlsToSave.push(canonicalOther);
}
try {
  const responses = await Promise.all(
    urlsToSave.map(url =>
      postToNoteAPI({
          uuid: "connections",
          date: url,
          note: true,
          userName: groupNameFromInput
        })
    )
  );
  console.log(`[✅] Group "${groupNameFromInput}" saved with URLs:`, urlsToSave);
} catch (err) {
  console.error("[Group Creation Error]", err);
  alert(`Failed to create group "${groupNameFromInput}". Error: ${err.message}`);
}
}
async function addUuidToGroup(groupName, uuid, newConnectedUuid, NOTE_API) {
  try {
    const payload = {
      uuid: "connections",
      date: `https://gogetta.nyc/team/location/${newConnectedUuid}`,  
      note: true,
      userName: groupName
    };
    const response = await postToNoteAPI(payload);
await checkResponse(response, `Adding UUID ${newConnectedUuid} to group ${groupName}`);
    console.log(`✅ Added UUID ${newConnectedUuid} to group ${groupName}`);
  } catch (err) {
    console.error('[Add UUID Error]', err);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  addConnectionModeButton();
});
function showReminderModal(uuid, NOTE_API) {
  const overlay = document.createElement("div");
  overlay.id = "reminder-modal";
  Object.assign(overlay.style, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100000
  });
  const modal = document.createElement("div");
  Object.assign(modal.style, {
    background: "#fff",
    padding: "20px",
    borderRadius: "8px",
    width: "320px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.25)"
  });
  modal.innerHTML = `
    <h3 style="margin-top:0;">Set a Reminder</h3>
    <label>Date: <input type="date" id="reminder-date" style="width:100%;margin:5px 0;"></label>
    <label>Note:<textarea id="reminder-note" style="width:100%;height:100px;"></textarea></label>
    <div style="text-align:right;margin-top:10px;">
      <button id="reminder-cancel">Cancel</button>
      <button id="reminder-google" style="margin-left:5px;">Add to Google</button>
      <button id="reminder-download" style="margin-left:5px;">Download .ics</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
attachMicButtonHandler();
  document.getElementById("reminder-cancel").onclick = () => overlay.remove();
  const handleSave = async (mode) => {
    const date = document.getElementById("reminder-date").value;
    const note = document.getElementById("reminder-note").value.trim();
    if (!date || !note) {
      alert("Please fill both date and note.");
      return;
    }
    await postToNoteAPI({ uuid, date, note, userName: "reminder" })
  
    const { org, location: locName,slug } = JSON.parse(localStorage.getItem("ypLastViewedService") || '{}');
    const summaryText = `${org || 'GoGetta'}${locName ? ' - ' + locName : ''}: ${note.slice(0, 40).replace(/\n/g, ' ')}`.slice(0, 60);
const ypLink = slug ? `\\nYP: https://yourpeer.nyc/locations/${slug}` : '';
const fullDescription = `${note.replace(/\n/g, '\\n')}${locName ? `\\nLocation: ${locName}` : ''}${org ? `\\nOrganization: ${org}` : ''}${ypLink}`;
    if (mode === 'google') {
      openGoogleCalendarEvent({
        title: summaryText,
        description: note +
  (locName ? `\nLocation: ${locName}` : '') +
  (org ? `\nOrganization: ${org}` : '') +
  (slug ? `\nYP: https://yourpeer.nyc/locations/${slug}` : ''),
        date,
        locationUrl: `https://gogetta.nyc/team/location/${uuid}`
      });
    } else if (mode === 'ics') {
      const icsContent = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-
BEGIN:VEVENT
UID:${uuid}-${date}@gogetta.nyc
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART;VALUE=DATE:${date.replace(/-/g, '')}
SUMMARY:${summaryText}
DESCRIPTION:${fullDescription}
URL:https://gogetta.nyc/team/location/${uuid}
END:VEVENT
END:VCALENDAR`.trim();
      const blob = new Blob([icsContent], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reminder-${date}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`[📅 Downloaded reminder .ics for ${date}]`);
    }
    overlay.remove();
  };
  document.getElementById("reminder-google").onclick = () => handleSave('google');
  document.getElementById("reminder-download").onclick = () => handleSave('ics');
}
function openGoogleCalendarEvent({ title, description, date, locationUrl }) {
  const start = date.replace(/-/g, '') + 'T120000Z'; 
  const end = date.replace(/-/g, '') + 'T130000Z';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details: description,
    location: locationUrl
  });
  const calendarUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;
  window.open(calendarUrl, '_blank');
}
async function getUserPasswordSafely() {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get(["userPassword"], result => {
        resolve(result?.userPassword || null);
      });
    } catch (err) {
      console.warn("[🛑 Extension context lost while getting password]", err);
      resolve(null);
    }
  });
}
async function getUserNameSafely() {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get(["userName"], result => {
        resolve(result?.userName || null);
      });
    } catch (err) {
      console.warn("[🛑 Extension context lost while getting username]", err);
      resolve(null);
    }
  });
}
function onUrlChange(callback) {
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      try {
        callback(currentUrl);
      } catch (error) {
        if (error.message && error.message.includes('Extension context invalidated')) {
          console.warn('[gghost] Extension context invalidated, stopping URL monitoring');
          return;
        }
        console.error('[gghost] URL change callback error:', error);
      }
    }
  }).observe(document, { subtree: true, childList: true });
  const pushState = history.pushState;
  history.pushState = function () {
    pushState.apply(this, arguments);
    window.dispatchEvent(new Event('pushstate'));
    window.dispatchEvent(new Event('locationchange'));
  };
  const replaceState = history.replaceState;
  history.replaceState = function () {
    replaceState.apply(this, arguments);
    window.dispatchEvent(new Event('replacestate'));
    window.dispatchEvent(new Event('locationchange'));
  };
  window.addEventListener('popstate', () => {
    window.dispatchEvent(new Event('locationchange'));
  });
}
function findServiceName(obj, serviceId) {
  let foundName = null;
  function recurse(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      for (const subItem of item) {
        if (foundName) return;
        recurse(subItem);
      }
    } else {
      if (
        item.id === serviceId &&
        typeof item.name === 'string' &&
        item.name.trim() !== ''
      ) {
        foundName = item.name.trim();
        return;
      }
      for (const key in item) {
        if (foundName) return;
        recurse(item[key]);
      }
    }
  }
  recurse(obj);
  return foundName;
}
// --- Position helpers ---
function getSavedYPPos() {
  try { return JSON.parse(localStorage.getItem("ypMiniPosition") || "{}"); } catch { return {}; }
}
function saveYPPos(pos) {
  localStorage.setItem("ypMiniPosition", JSON.stringify(pos || {}));
}
function getCurrentYPPos(wrapper) {
  if (!wrapper) return null;
  const rect = wrapper.getBoundingClientRect();
  return { left: Math.max(0, Math.round(rect.left)), top: Math.max(0, Math.round(rect.top)) };
}

// --- Refresh (kept as-is) ---
function refreshYourPeerEmbed() {
  const wrapper = document.getElementById("yp-embed-wrapper");
  if (!wrapper) return false; // Not open
  const iframe = wrapper.querySelector("iframe");
  if (iframe) {
    const currentSrc = iframe.src;
    iframe.src = currentSrc;
    return true;
  }
  return false;
}
function slugifyName(name) {
  // Check if only letters, numbers, and spaces
  if (/^[A-Za-z0-9 ]+$/.test(name)) {
    return "#" + name.trim().replace(/\s+/g, "-");
  }
  return "";
}
function getServiceIdFromPath(url = location.href) {
  const m = url.match(/\/services\/([0-9a-fA-F-]{36})(?:\/|$)/);
  return m?.[1] || null;
}

function coerceServicesArray(services) {
  if (Array.isArray(services)) return services;
  // also handle object map form: { "<id>": {id, name}, ... }
  if (services && typeof services === "object") {
    return Object.values(services);
  }
  return [];
}

function serviceNameToHash(name) {
  // only letters, numbers, spaces -> "#Name-With-Dashes"
  if (typeof name === "string" && /^[A-Za-z0-9 ]+$/.test(name)) {
    return "#" + name.trim().replace(/\s+/g, "-");
  }
  return "";
}

function pickServiceHash(services, preferredId = null) {
  const arr = coerceServicesArray(services);
  if (!arr.length) return "";

  let chosen = null;
  if (preferredId) {
    chosen = arr.find(s => s?.id === preferredId) || null;
  }
  if (!chosen) {
    chosen = arr[0]; // fallback to first
  }
  return serviceNameToHash(chosen?.name);
}

/* =========================
   Helpers: service hash
   ========================= */
function getServiceIdFromPath(){
  // e.g. .../services/9e3f.../languages
  const m = location.pathname.match(/\/services\/([0-9a-f-]{8,})\b/i);
  return m ? m[1] : null;
}
function pickServiceHash(services, preferId){
  if (!Array.isArray(services) || services.length === 0) return "";
  let svc = null;
  if (preferId) svc = services.find(s => s.id === preferId);
  if (!svc) svc = services[0];
  if (!svc?.name) return "";
  // Only use a hash if the name is letters/numbers/spaces
  if (!/^[A-Za-z0-9 ]+$/.test(svc.name)) return "";
  return "#" + svc.name.trim().replace(/\s+/g, "-");
}

/* ==========================================
   Helpers: Google Voice / Gmail link builders
   ========================================== */
function digitsOnly(s){ return (s||"").replace(/\D/g, ""); }
function buildGVUrl(raw){
  // Sanitize input - remove any tel: prefixes that might be present
  const sanitized = String(raw).replace(/^tel:/i, '');
  console.log('[buildGVUrl] Processing:', raw, '-> sanitized:', sanitized); // Debug log

  // More robust extension parsing
  const m = sanitized.match(/^\s*(.+?)(?:\s*(?:[,;]|x|ext\.?|extension|#)\s*(\d+))?\s*$/i);
  let main = m ? m[1] : sanitized;
  const ext = m && m[2] ? m[2] : "";

  console.log('[buildGVUrl] Main part before digits extraction:', main); // Debug log

  let digits = digitsOnly(main);
  console.log('[buildGVUrl] Digits extracted:', digits); // Debug log

  // Use last 10 digits for US numbers; adjust if you need intl routing
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) {
    console.log('[buildGVUrl] Invalid digit count:', digits.length); // Debug log
    return null;
  }

  const extSuffix = ext ? `,${ext}` : "";
  const result = `https://voice.google.com/u/0/calls?a=nc,%2B1${digits}${extSuffix}`;
  console.log('[buildGVUrl] Generated URL:', result); // Debug log
  return result;
}
function buildGmailUrl(email){
  return `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email.trim())}`;
}

/* =======================================================
   Linkify plain text + rewrite existing tel:/mailto: links
   ======================================================= */
function linkifyPhonesAndEmails(rootDoc){
  const root = rootDoc || document;

  // 1) Rewrite existing <a href="tel:"> and <a href="mailto:">
  root.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach(a => {
    const href = a.getAttribute('href') || "";
    if (href.startsWith("tel:")) {
      const url = buildGVUrl(href.slice(4));
      if (url) a.setAttribute('href', url);
    } else {
      const email = href.replace(/^mailto:/, "");
      a.setAttribute('href', buildGmailUrl(email));
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  // 2) Linkify plain text occurrences
  const walker = document.createTreeWalker(
    root.body || root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        if (!node.nodeValue || !/[A-Za-z0-9@]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        // skip inside these
        if (node.parentElement?.closest('a,script,style,textarea,select,code,pre,svg,#yp-embed-wrapper')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const emailRe = /[\w.+-]+@[\w.-]+\.\w{2,}/g;
  const phoneRe = /(?:(?:\+?1[\s.\-]*)?)\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}(?:\s*(?:x|ext\.?|extension|#)\s*\d+)?/gi;
  const combo = new RegExp(`${phoneRe.source}|${emailRe.source}`, 'gi');

  const textNodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n);

  textNodes.forEach(tn => {
    const text = tn.nodeValue;
    let match, last = 0, changed = false;
    const frag = document.createDocumentFragment();

    while ((match = combo.exec(text))) {
      changed = true;
      const part = text.slice(last, match.index);
      if (part) frag.appendChild(document.createTextNode(part));

      const found = match[0];
      const a = document.createElement('a');
      if (found.includes('@')) {
        a.href = buildGmailUrl(found);
      } else {
        const gv = buildGVUrl(found);
        if (!gv) {
          frag.appendChild(document.createTextNode(found));
          last = combo.lastIndex;
          continue;
        }
        a.href = gv;
      }
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = found.trim();
      frag.appendChild(a);

      last = combo.lastIndex;
    }

    if (!changed) return;
    const tail = text.slice(last);
    if (tail) frag.appendChild(document.createTextNode(tail));
    tn.parentNode.replaceChild(frag, tn);
  });
}

// Re-run linkification on DOM changes (SPA-friendly)
function installLinkObservers(){
  if (window.top !== window.self) return;
  linkifyPhonesAndEmails(document);
  const mo = new MutationObserver(() => linkifyPhonesAndEmails(document));
  mo.observe(document.body, { childList: true, subtree: true });
}

/* =====================================
   YourPeer embed create/remount function
   ===================================== */
function createYourPeerEmbedWindow(slug, services, onClose = () => {}, positionOverride = null) {
  if (!slug) return;

  const wrapperId = "yp-embed-wrapper";
  const existing = document.getElementById(wrapperId);
  let pos = positionOverride || getCurrentYPPos(existing) || getSavedYPPos();
  existing?.remove();

  const defaultTop = 120;
  const defaultLeft = 360;
  const top = Number.isFinite(pos?.top) ? pos.top : defaultTop;
  const left = Number.isFinite(pos?.left) ? pos.left : defaultLeft;

  // Prefer a service hash if current URL has /services/<id>..., else first service
  const serviceIdFromUrl = getServiceIdFromPath();
  const hash = pickServiceHash(services, serviceIdFromUrl);

  const wrapper = document.createElement("div");
  wrapper.id = wrapperId;
  wrapper.dataset.slug = slug;
  wrapper.dataset.hash = hash || ""; // used by remount
  Object.assign(wrapper.style, {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    width: "400px",
    height: "500px",
    background: "#fff",
    border: "2px solid #000",
    borderRadius: "8px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    zIndex: 99999,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column"
  });

  // Drag bar
  const dragBar = document.createElement("div");
  Object.assign(dragBar.style, {
    background: "#eee",
    padding: "6px 10px",
    cursor: "grab",
    fontWeight: "bold",
    borderBottom: "1px solid #ccc",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  });

  // Copy link button
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy YP Link";
  Object.assign(copyBtn.style, {
    fontSize: "12px",
    padding: "4px 8px",
    cursor: "pointer",
    backgroundColor: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: "4px"
  });
  copyBtn.onclick = () => {
    const url = `https://yourpeer.nyc/locations/${slug}${hash}`;
    navigator.clipboard.writeText(url)
      .then(() => { copyBtn.textContent = "Copied!"; setTimeout(() => { copyBtn.textContent = "Copy YP Link"; }, 1200); })
      .catch(() => { copyBtn.textContent = "Failed to copy"; setTimeout(() => { copyBtn.textContent = "Copy YP Link"; }, 1200); });
  };

  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;";
  Object.assign(closeBtn.style, { cursor: "pointer", fontSize: "18px", padding: "0 6px" });
  closeBtn.onclick = () => {
    saveYPPos(getCurrentYPPos(wrapper));
    wrapper.remove();
    onClose();
  };

  dragBar.appendChild(copyBtn);
  dragBar.appendChild(closeBtn);
  wrapper.appendChild(dragBar);

  // Iframe
  const iframe = document.createElement("iframe");
  iframe.src = `https://yourpeer.nyc/locations/${slug}${hash}`;
  Object.assign(iframe.style, { border: "none", width: "100%", height: "100%" });
  wrapper.appendChild(iframe);

  document.body.appendChild(wrapper);

  // Drag handling (live save)
  let isDragging = false, offsetX = 0, offsetY = 0;
  dragBar.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = wrapper.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragBar.style.cursor = "grabbing";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const maxX = window.innerWidth - wrapper.offsetWidth;
    const maxY = window.innerHeight - wrapper.offsetHeight;
    const newX = Math.min(Math.max(0, e.clientX - offsetX), maxX);
    const newY = Math.min(Math.max(0, e.clientY - offsetY), maxY);
    wrapper.style.left = `${newX}px`;
    wrapper.style.top = `${newY}px`;
    saveYPPos({ left: newX, top: newY });
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
    dragBar.style.cursor = "grab";
  });

  // Remount after OK / DONE EDITING (fix setTimeout)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button.Button-primary");
    if (!btn) return;
    const txt = (btn.textContent || "").trim().toUpperCase();
    if (txt === "OK" || txt === "DONE EDITING") {
      setTimeout(() => remountYourPeerEmbed(), 1000);
    }
  });
}

// Use the stored slug/hash to refresh the iframe src
function remountYourPeerEmbed() {
  const wrapper = document.getElementById("yp-embed-wrapper");
  if (!wrapper) return;
  const slug = wrapper.dataset.slug || "";
  const hash = wrapper.dataset.hash || "";
  const iframe = wrapper.querySelector("iframe");
  if (!iframe || !slug) return;
  const url = `https://yourpeer.nyc/locations/${slug}${hash}`;
  // Force refresh even if same URL
  iframe.src = url;
}

/* Kick off linkifying for host page */
installLinkObservers();

// --- Recreate (preserving coords) ---
function recreateYourPeerEmbed(slug, services = []) {
  // Prefer current live coords if window exists; else saved; else defaults inside create
  const existing = document.getElementById("yp-embed-wrapper");
  const pos = getCurrentYPPos(existing) || getSavedYPPos() || null;
  createYourPeerEmbedWindow(slug, services, () => {}, pos);
}



// Example


document.addEventListener("DOMContentLoaded", function() {
  const signInHeader = document.querySelector('.sign-in-header');
  if (signInHeader) {
    const noteOverlay = document.getElementById('gg-note-overlay');
    const noteWrapper = document.getElementById('gg-note-wrapper');
    if (noteOverlay) {
      noteOverlay.style.display = 'none';  
    }
    if (noteWrapper) {
      noteWrapper.style.display = 'none';  
    }
  }
});
function addMicrophoneButton() {
  const reminderNote = document.getElementById("reminder-note");
  if (!reminderNote) {
    console.warn("🎤 reminder-note element not found.");
    return null;  
  }
  const micButton = document.createElement("button");
  micButton.id = "mic-button";
  micButton.style.marginLeft = "10px";
  micButton.style.padding = "10px";
  micButton.style.background = "#fff";
  micButton.style.border = "2px solid #000";
  micButton.style.borderRadius = "50%";
  micButton.style.cursor = "pointer";
  micButton.innerHTML = "🎤";
  reminderNote.parentElement.appendChild(micButton);
  return micButton;
}
let recognition;
let isRecognizing = false;
function initializeSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window)) {
    alert("Speech recognition is not supported by this browser.");
    return;
  }
  recognition = new webkitSpeechRecognition(); 
  recognition.continuous = true; 
  recognition.interimResults = true; 
  recognition.lang = "en-US"; 
  recognition.maxAlternatives = 1; 
  recognition.onstart = () => {
    isRecognizing = true;
    console.log("Speech recognition started.");
  };
  recognition.onend = () => {
    isRecognizing = false;
    console.log("Speech recognition ended.");
  };
  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };
  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const reminderNote = document.getElementById("reminder-note");
    reminderNote.value = transcript; 
  };
}
function attachMicButtonHandler() {
  const micButton = addMicrophoneButton(); 
  if (!micButton) {
    console.warn("Mic button could not be added to the reminder modal.");
    return;
  }
  if (!recognition) {
    console.warn("Speech recognition not initialized. Mic button will not work.");
    return;
  }
  micButton.addEventListener('click', () => {
    const reminderNoteTextarea = document.getElementById("reminder-note");
    if (!reminderNoteTextarea) {
        console.error("reminder-note textarea not found on mic click!");
        return;
    }
    if (isRecognizing) {
      recognition.stop();
      micButton.innerHTML = "Mic"; 
    } else {
      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        reminderNoteTextarea.value += (reminderNoteTextarea.value.length > 0 ? " " : "") + transcript;
      };
      recognition.onstart = () => {
        isRecognizing = true;
        micButton.innerHTML = "🛑"; 
        console.log("Reminder speech recognition started.");
      };
      recognition.onend = () => {
        isRecognizing = false;
        micButton.innerHTML = "🎤"; 
        console.log("Reminder speech recognition ended.");
      };
      recognition.onerror = (event) => {
        console.error("Reminder speech recognition error:", event.error);
        if(isRecognizing) {
            isRecognizing = false;
            micButton.innerHTML = "🎤";
        }
      };
      try {
        recognition.start();
      } catch (e) {
        console.error("Error starting recognition:", e);
        alert("Could not start microphone. Please check permissions and try again.");
      }
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  initializeSpeechRecognition(); 
});
async function injectGoGettaButtons() {
if (document.body.dataset.gghostRendered === 'true') return;
document.body.dataset.gghostRendered = 'true';
  document.querySelectorAll('[data-gghost-container]').forEach(container => container.remove());
  globalButtonDropdown = null;
  buttonActions.length = 0;
  const existingGoToYpBtn = document.querySelector('[data-go-to-yp]');
  if (existingGoToYpBtn) {
    existingGoToYpBtn.remove();
  }
  const host = location.hostname;
  const path = location.pathname;
  if (!host.includes('gogetta.nyc')) return;
  // Global dropdown system for all gghost buttons

  const createHoverDropdown = () => {
    if (globalButtonDropdown) return globalButtonDropdown;

    const container = document.createElement('div');
    container.setAttribute('data-gghost-container', 'true');
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '0px',
      left: '0px',
      zIndex: '9999'
    });

    const hoverButton = document.createElement('button');
    hoverButton.textContent = 'Hover';
    hoverButton.setAttribute('data-gghost-button', 'true');
    Object.assign(hoverButton.style, {
      padding: '4px 8px',
      fontSize: '11px',
      background: '#fff',
      border: '1px solid black',
      borderLeft: 'none',
      borderBottom: 'none',
      borderRadius: '0 4px 0 0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    });

    const dropdown = document.createElement('div');
    Object.assign(dropdown.style, {
      position: 'absolute',
      bottom: '100%',
      left: '0',
      marginBottom: '8px',
      background: '#fff',
      border: '2px solid black',
      borderRadius: '4px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      opacity: '0',
      transform: 'translateY(10px)',
      transition: 'all 0.2s ease',
      pointerEvents: 'none',
      minWidth: '200px'
    });

    let hoverTimeout;
    const showDropdown = () => {
      clearTimeout(hoverTimeout);
      dropdown.style.opacity = '1';
      dropdown.style.transform = 'translateY(0)';
      dropdown.style.pointerEvents = 'auto';
    };

    const hideDropdown = () => {
      hoverTimeout = setTimeout(() => {
        dropdown.style.opacity = '0';
        dropdown.style.transform = 'translateY(10px)';
        dropdown.style.pointerEvents = 'none';
      }, 100);
    };

    container.addEventListener('mouseenter', showDropdown);
    container.addEventListener('mouseleave', hideDropdown);

    container.appendChild(dropdown);
    container.appendChild(hoverButton);
    document.body.appendChild(container);

    globalButtonDropdown = { container, dropdown };
    return globalButtonDropdown;
  };

  const createButton = (text, onClick) => {
    const dropdown = createHoverDropdown();
    
    const option = document.createElement('div');
    option.textContent = text;
    Object.assign(option.style, {
      padding: '8px 12px',
      cursor: 'pointer',
      fontSize: '13px',
      borderBottom: buttonActions.length > 0 ? '1px solid #ccc' : 'none',
      transition: 'background 0.1s ease'
    });

    option.addEventListener('mouseenter', () => {
      option.style.background = '#f0f0f0';
    });

    option.addEventListener('mouseleave', () => {
      option.style.background = 'transparent';
    });

    option.addEventListener('click', onClick);

    // Add to top of dropdown
    if (dropdown.dropdown.firstChild) {
      dropdown.dropdown.insertBefore(option, dropdown.dropdown.firstChild);
      dropdown.dropdown.firstChild.nextSibling.style.borderBottom = '1px solid #ccc';
    } else {
      dropdown.dropdown.appendChild(option);
    }

    buttonActions.push({ text, onClick, element: option });
    return { remove: () => option.remove(), element: option };
  };
const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];
if (uuid === "connections") {
  console.warn("[Notes] Skipping rendering for reserved UUID: connections");
  return;
}
  if (uuid) {
    const currentMode = teamMatch ? 'edit' : 'view';
    const targetUrl = currentMode === 'edit'
      ? `https://gogetta.nyc/find/location/${uuid}`
      : `https://gogetta.nyc/team/location/${uuid}`;
    createButton(
      currentMode === 'edit' ? 'Switch to Frontend Mode' : 'Switch to Edit Mode',
      () => {
        if (currentMode === 'edit') {
          sessionStorage.setItem('arrivedViaFrontendRedirect', 'true');
        } else if (sessionStorage.getItem('arrivedViaFrontendRedirect') === 'true') {
          sessionStorage.removeItem('arrivedViaFrontendRedirect');
          history.back();
          return;
        }
        window.location.href = targetUrl;
      }, 
      0 
    );
  createButton('Show on YP', async () => {
  console.log(`[YPButton] 🔎 Attempting to fetch slug for UUID (Show on YP): ${uuid}`);
  const path = location.pathname;
  const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);


if (fullServiceMatch) {
  const locationId = fullServiceMatch[1];
  const serviceId = fullServiceMatch[2];
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${locationId}`);
    const data = await res.json();

    // 🟢 record validation timestamp
    await maybeRecordValidation(locationId, data);

    const slug = data.slug;
    const serviceName = findServiceName(data, serviceId);
    if (!slug || !serviceName) {
      console.warn("[YPButton] ❌ Missing slug or service name for service page. Will not redirect.");
      return;
    }
    const forbiddenChars = /[(){}\[\]"'“”‘’—–]/;
    if (forbiddenChars.test(serviceName)) {
      console.warn("[YPButton] 🚫 Forbidden characters in service name. Will not redirect.");
      return;
    }
    sessionStorage.setItem('ypScrollTarget', serviceName);
    const safeServiceName = serviceName
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-+]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const serviceHash = `#${safeServiceName}`;
    const finalUrl = `https://yourpeer.nyc/locations/${slug}${serviceHash}`;
    console.log(`[YPButton] ✅ Redirecting to YP service (from service page): ${finalUrl}`);
    window.location.href = finalUrl;
  } catch (err) {
    console.error("[YPButton] 🛑 Error fetching location/service data for service page:", err);
    return;
  }
} else {
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
    const data = await res.json();

    // 🟢 record validation timestamp
    await maybeRecordValidation(uuid, data);

    const slug = data.slug;
    let storedData = JSON.parse(localStorage.getItem("ypLastViewedService")) || [];
    const newEntry = {
      name: data.Organization?.name,
      location: data.name,
      uuid: uuid,
      slug: slug
    };
    if (!Array.isArray(storedData)) {
      console.warn("Stored data is not an array. Initializing as an empty array.");
      storedData = [];
    }
    const existingEntryIndex = storedData.findIndex(entry => entry.uuid === uuid);
    if (existingEntryIndex === -1) {
      storedData.push(newEntry);
    } else {
      storedData[existingEntryIndex] = newEntry;
    }
    localStorage.setItem("ypLastViewedService", JSON.stringify(storedData));
    console.log(`[YPButton] ✅ Successfully stored: ${data.Organization?.name} - ${data.name} for UUID: ${uuid}`);
    if (slug) {
      const ypUrl = `https://yourpeer.nyc/locations/${slug}`;
      console.log(`[YPButton] ✅ Redirecting to YourPeer (location level): ${ypUrl}`);
      window.location.href = ypUrl;
    } else {
      console.warn('[YPButton] ❌ Slug not found for location-level redirect.');
    }
  } catch (err) {
    console.error('[YPButton] 🛑 Error fetching slug for location-level redirect:', err);
  }
}

}); 
const futureBtn = createButton(
  'Add future/online org',
  () => {
    openFutureOnlineModal(); // 2) Then open the modal
  }
);


// Closure handling functionality
async function createClosureDialog(locationUuid = null) {
  // Fetch current location status if UUID is provided
  let isCurrentlyClosed = false;
  if (locationUuid) {
    try {
      const locationData = await fetchLocationDetails(locationUuid);
      isCurrentlyClosed = locationData.isClosed;
    } catch (err) {
      console.warn('[Closure] Failed to fetch location status:', err);
    }
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 24px;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  // Smart questions based on current closure status
  const title = isCurrentlyClosed ? "Location Currently Closed" : "Location Management";
  const message = isCurrentlyClosed
    ? "This location is currently marked as closed. What would you like to do?"
    : "What would you like to do with this location?";

  const primaryButtonText = isCurrentlyClosed ? "Reopen Location" : "Close Location";
  const primaryButtonColor = isCurrentlyClosed ? "#28a745" : "#dc3545";
  const primaryButtonAction = isCurrentlyClosed ? "open" : "close";

  // Only show change closure notice button for closed locations
  const showChangeButton = isCurrentlyClosed;
  const changeButtonHtml = showChangeButton ? `
    <button id="change-closure-btn" style="
      background: #007bff;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
    ">Update Closure Notice</button>
  ` : '';

  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px 0; color: #333;">${title}</h3>
    <p style="margin: 0 0 24px 0; color: #666; line-height: 1.4;">
      ${message}
    </p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="primary-action-btn" data-action="${primaryButtonAction}" style="
        background: ${primaryButtonColor};
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
      ">${primaryButtonText}</button>
      ${changeButtonHtml}
    </div>
    <div style="margin-top: 16px; text-align: center;">
      <button id="cancel-navigation-btn" style="
        background: #6c757d;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      ">Cancel</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  return new Promise((resolve) => {
    document.getElementById('primary-action-btn').addEventListener('click', (e) => {
      const action = e.target.getAttribute('data-action');
      overlay.remove();
      resolve(action); // Will be 'open' or 'close'
    });

    // Only add event listener if the button exists (for closed locations)
    const changeBtn = document.getElementById('change-closure-btn');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        overlay.remove();
        resolve('change');
      });
    }

    document.getElementById('cancel-navigation-btn').addEventListener('click', () => {
      overlay.remove();
      resolve('cancel');
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve('cancel');
      }
    });
  });
}

function setupClosureAutoClicks(mode) {
  console.log('[Closure] 🤖 Setting up auto-click handlers for mode:', mode);
  
  let hasClickedFirst = false;
  let hasClickedYes = false;
  let currentUrl = location.href;

  const performAutoClicks = () => {
    const path = location.pathname;
    
    if (mode === 'close') {
      // CLOSE SEQUENCE: NO, IT'S CLOSED → YES → BACK TO THE MAP
      
      // Step 1: Click "NO, IT'S CLOSED" on isClosed page
      if (!hasClickedFirst && path.includes('/isClosed')) {
        const isClosedBtn = Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.trim() === "NO, IT'S CLOSED" && 
          btn.classList.contains('Button-primary')
        );
        
        if (isClosedBtn) {
          console.log('[Closure] 🖱️ Clicking "NO, IT\'S CLOSED"');
          isClosedBtn.click();
          hasClickedFirst = true;
          setTimeout(() => {
            createBubble('NO, IT\'S CLOSED Clicked!');
          }, 100);
          return;
        }
      }

      // Step 2: Click "YES"
      if (hasClickedFirst && !hasClickedYes) {
        const yesBtn = Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.trim() === "YES" && 
          btn.classList.contains('Button-primary') &&
          btn.classList.contains('Button-fluid')
        );
        
        if (yesBtn) {
          console.log('[Closure] 🖱️ Clicking "YES"');
          yesBtn.click();
          hasClickedYes = true;
          setTimeout(() => {
            createBubble('YES Clicked!');
          }, 100);
          return;
        }
      }

      // Step 3: Click "BACK TO THE MAP"
      if (hasClickedYes) {
        const backToMapBtn = Array.from(document.querySelectorAll('button')).find(btn =>
          btn.textContent.trim() === "BACK TO THE MAP" &&
          btn.classList.contains('Button-primary') &&
          btn.classList.contains('Button-fluid')
        );

        if (backToMapBtn) {
          console.log('[Closure] 🖱️ Clicking "BACK TO THE MAP"');
          backToMapBtn.click();
          setTimeout(() => {
            createBubble('BACK TO THE MAP Clicked!');
            cleanup();
          }, 100);
          return;
        }
      }

    } else if (mode === 'open') {
      // OPEN SEQUENCE: YES, IT'S OPEN → BACK TO THE MAP

      // Step 1: Click "YES, IT'S OPEN" on isClosed page
      if (!hasClickedFirst && path.includes('/isClosed')) {
        const yesItsOpenBtn = Array.from(document.querySelectorAll('button')).find(btn =>
          btn.textContent.trim() === "YES, IT'S OPEN" &&
          btn.classList.contains('Button-primary')
        );

        if (yesItsOpenBtn) {
          console.log('[Closure] 🖱️ Clicking "YES, IT\'S OPEN"');
          yesItsOpenBtn.click();
          hasClickedFirst = true;
          setTimeout(() => {
            createBubble('YES, IT\'S OPEN Clicked!');
          }, 100);
          return;
        }
      }

      // Step 2: Click "BACK TO THE MAP"
      if (hasClickedFirst) {
        const backToMapBtn = Array.from(document.querySelectorAll('button')).find(btn =>
          btn.textContent.trim() === "BACK TO THE MAP" &&
          btn.classList.contains('Button-primary') &&
          btn.classList.contains('Button-fluid')
        );

        if (backToMapBtn) {
          console.log('[Closure] 🖱️ Clicking "BACK TO THE MAP"');
          backToMapBtn.click();
          setTimeout(() => {
            createBubble('BACK TO THE MAP Clicked!');
            cleanup();
          }, 100);
          return;
        }
      }

    } else if (mode === 'change') {
      // CHANGE SEQUENCE: NO, LET'S EDIT IT → (wait for user OK) → YES
      
      // Step 1: Click "NO, LET'S EDIT IT" on closureInfo page
      if (!hasClickedFirst && path.includes('/closureInfo')) {
        const noLetsEditBtn = Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.trim() === "NO, LET'S EDIT IT" && 
          btn.classList.contains('Button-primary')
        );
        
        if (noLetsEditBtn) {
          console.log('[Closure] 🖱️ Clicking "NO, LET\'S EDIT IT"');
          noLetsEditBtn.click();
          hasClickedFirst = true;
          setTimeout(() => {
            createBubble('NO, LET\'S EDIT IT Clicked!');
          }, 100);
          return;
        }
      }

      // Step 2: Wait for user to click OK, then click "YES"
      if (hasClickedFirst && !hasClickedYes) {
        const yesBtn = Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.trim() === "YES" && 
          btn.classList.contains('Button-primary') &&
          btn.classList.contains('Button-fluid')
        );
        
        if (yesBtn) {
          console.log('[Closure] 🖱️ Clicking "YES"');
          yesBtn.click();
          hasClickedYes = true;
          setTimeout(() => {
            createBubble('YES Clicked!');
            cleanup();
          }, 100);
          return;
        }
      }
    }
  };

  // Monitor URL changes and DOM mutations
  const observer = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      console.log('[Closure] 🔄 URL changed to:', currentUrl);
      setTimeout(performAutoClicks, 100); // Give page time to load
    }
    performAutoClicks(); // Also check on DOM changes
  });

  // Monitor popstate for back/forward navigation
  const popstateHandler = () => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      console.log('[Closure] 🔄 Popstate URL change to:', currentUrl);
      setTimeout(performAutoClicks, 100);
    }
  };

  const cleanup = () => {
    observer.disconnect();
    window.removeEventListener('popstate', popstateHandler);
    console.log('[Closure] 🛑 Auto-click sequence completed, cleaning up observers');
  };

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', popstateHandler);
  
  // Initial check
  setTimeout(performAutoClicks, 100);
  
  // Return cleanup function
  return cleanup;
}

// Back button interception for closure handling
function setupClosureBackButtonHandler() {
if (location.hostname === "gogetta.nyc") {
  const uuidPattern = new RegExp(`/team/location/${uuid}/?$`); // Regex pattern to match the UUID with or without slash
  if (!uuidPattern.test(location.pathname)) {
    return; // URL matches the desired form
  }
}
  let isHandlingNavigation = false;
  
  // Show dialog and handle navigation
  const showDialogAndNavigate = async () => {
    if (isHandlingNavigation) return;
    isHandlingNavigation = true;
    
    console.log('[Closure] 🔙 Navigation detected, showing closure dialog');
    
    const choice = await createClosureDialog(uuid);
    
    if (choice === 'close') {
      console.log('[Closure] 🔄 User chose to close location, navigating to isClosed then clicking NO');
      setupClosureAutoClicks('close');
      // Navigate to isClosed page where we'll auto-click NO
      window.location.replace(`https://gogetta.nyc/team/location/${uuid}/isClosed`);
    } else if (choice === 'open') {
      console.log('[Closure] 🔄 User chose to open location, navigating to isClosed then clicking YES');
      setupClosureAutoClicks('open');
      // Navigate to isClosed page where we'll auto-click YES
      window.location.replace(`https://gogetta.nyc/team/location/${uuid}/isClosed`);
    } else if (choice === 'change') {
      console.log('[Closure] 🔄 User chose to change closure notice, redirecting to closureInfo');
      setupClosureAutoClicks('change');
      // Allow navigation by navigating directly
      window.location.replace(`https://gogetta.nyc/team/location/${uuid}/closureInfo`);
    } else {
      console.log('[Closure] ❌ User cancelled, staying on page');
      isHandlingNavigation = false;
      // Push current state back to maintain URL
      history.pushState(null, '', location.href);
    }
  };
  
  // Block back button navigation
  window.addEventListener('popstate', (e) => {
    const path = location.pathname;
    const isOnMainLocationPage = new RegExp(`^/team/location/${uuid}/?$`).test(path);
    
    if (isOnMainLocationPage) {
      // Immediately push the state back to prevent navigation
      history.pushState(null, '', location.href);
      showDialogAndNavigate();
    }
  });
  
  // Push initial state to enable popstate detection
  history.pushState(null, '', location.href);
}

// Bubble feedback function (reused from streetview.js)
function createBubble(text) {
  const bubble = document.createElement('div');
  Object.assign(bubble.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(66, 133, 244, 0.9)',
    color: 'white',
    padding: '12px 20px',
    borderRadius: '25px',
    fontSize: '14px',
    fontWeight: 'bold',
    zIndex: '100002',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    animation: 'bubbleFade 2s ease-out forwards'
  });
  bubble.textContent = text;

  // Add CSS animation if not already present
  if (!document.querySelector('#bubble-animation-style')) {
    const style = document.createElement('style');
    style.id = 'bubble-animation-style';
    style.textContent = `
      @keyframes bubbleFade {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(bubble);

  setTimeout(() => {
    if (bubble.parentNode) bubble.remove();
  }, 2000);
}

// Add Back button click handler for closure dialog
function setupClosureBackButtonClicks() {
  document.addEventListener('click', function(e) {
    const t = e.target;
    if (t && t.tagName === 'BUTTON' && t.textContent && t.textContent.replace(/\s/g, '').startsWith('<Back')) {
      const currentUuid = uuid; // Use the uuid from scope
      if (!currentUuid) return;
      
      // Check if we're on a location page that should show closure dialog
      const path = location.pathname;
      const isOnMainLocationPage = new RegExp(`^/team/location/${currentUuid}/?$`).test(path);
      
      if (isOnMainLocationPage) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        console.log('[Closure] 🔙 Back button click detected, showing closure dialog');
        
        createClosureDialog(currentUuid).then(choice => {
          if (choice === 'close') {
            console.log('[Closure] 🔄 User chose to close location, navigating to isClosed then clicking NO');
            setupClosureAutoClicks('close');
            // Navigate to isClosed page where we'll auto-click NO
            window.location.replace(`https://gogetta.nyc/team/location/${currentUuid}/isClosed`);
          } else if (choice === 'open') {
            console.log('[Closure] 🔄 User chose to open location, navigating to isClosed then clicking YES');
            setupClosureAutoClicks('open');
            // Navigate to isClosed page where we'll auto-click YES
            window.location.replace(`https://gogetta.nyc/team/location/${currentUuid}/isClosed`);
          } else if (choice === 'change') {
            console.log('[Closure] 🔄 User chose to change closure notice, redirecting to closureInfo');
            setupClosureAutoClicks('change');
            window.location.replace(`https://gogetta.nyc/team/location/${currentUuid}/closureInfo`);
          } else {
            console.log('[Closure] ❌ User cancelled back action');
            // Stay on current page - no action needed
          }
        });
        
        return false; // Additional prevention
      }
    }
  }, true); // Use capture phase to intercept before other handlers
}

// Initialize closure handling with URL change monitoring
let currentClosureHandlers = null;

function initializeClosureForCurrentPage() {
  const currentPath = location.pathname;
  const shouldInitializeClosure = uuid && new RegExp(`^/team/location/${uuid}/?$`).test(currentPath);

  // Clean up existing handlers
  if (currentClosureHandlers) {
    currentClosureHandlers.cleanup();
    currentClosureHandlers = null;
  }

  if (shouldInitializeClosure) {
    currentClosureHandlers = {
      cleanup: () => {
        // Any cleanup logic if needed
      }
    };
    setupClosureBackButtonHandler();
    setupClosureBackButtonClicks();
    console.log('[Closure] 🔧 Closure back button and click handlers initialized for UUID:', uuid);
  } else {
    // If we are on a closure page directly, start the autoclick sequence.
    if (currentPath.includes('/closureInfo')) {
      console.log('[Closure] Detected /closureInfo page on load, starting auto-click for "change" mode.');
      setupClosureAutoClicks('change');
    } else if (currentPath.includes('/isClosed')) {
      console.log('[Closure] Detected /isClosed page on load, starting auto-click for "close" mode.');
      setupClosureAutoClicks('close');
    }
  }
}

// Initialize on page load
initializeClosureForCurrentPage();

// Monitor URL changes for SPA navigation
window.addEventListener('locationchange', () => {
  console.log('[Closure] 🔄 URL changed, reinitializing closure handling');
  initializeClosureForCurrentPage();
});

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

// Edit History Overlay Function
async function showEditHistoryOverlay(currentLocationUuid, currentUser) {
  // Remove existing overlay if present
  const existingOverlay = document.getElementById('edit-history-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'edit-history-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.8)', zIndex: '2147483647',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    backgroundColor: '#fff', borderRadius: '8px', padding: '20px',
    maxWidth: '600px', maxHeight: '80vh', width: '90%',
    overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
  });

  // Header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '20px';

  const title = document.createElement('h2');
  title.textContent = 'Your Edit History';
  title.style.margin = '0';
  title.style.fontSize = '20px';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    background: 'none', border: 'none', fontSize: '24px',
    cursor: 'pointer', padding: '0', color: '#666'
  });
  closeBtn.addEventListener('click', () => overlay.remove());

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Loading message
  const loading = document.createElement('div');
  loading.textContent = 'Loading your edit history...';
  loading.style.textAlign = 'center';
  loading.style.padding = '20px';
  loading.style.color = '#666';

  const progress = document.createElement('div');
  progress.style.textAlign = 'center';
  progress.style.padding = '10px';
  progress.style.color = '#999';
  progress.style.fontSize = '12px';

  modal.appendChild(header);
  modal.appendChild(loading);
  modal.appendChild(progress);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Helper function to get current page UUID
  function getCurrentPageUuid() {
    const fullServiceMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
    const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
    const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
    return (fullServiceMatch || teamMatch || findMatch)?.[1] || null;
  }

  try {
    // Fetch all notes data
    const baseURL = window.gghost?.baseURL;
    console.log('[Edit History] Base URL:', baseURL);
    if (!baseURL) {
      throw new Error('Base URL not available');
    }

    const jsonUrl = `${baseURL}locationNotes.json`;
    console.log('[Edit History] Fetching from:', jsonUrl);
    const res = await fetch(jsonUrl, { cache: 'no-store' });
    console.log('[Edit History] Fetch response:', res.status, res.ok);
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status}`);
    }

    const allData = await res.json();
    console.log('[Edit History] Data received:', allData);
    if (!allData || typeof allData !== 'object') {
      throw new Error('Invalid data format');
    }

    // Filter user's edits and collect location UUIDs
    const userEdits = [];
    const locationUuids = new Set();

    console.log('[Edit History] Current user:', currentUser);
    console.log('[Edit History] All data keys:', Object.keys(allData));

    progress.textContent = 'Analyzing your edits...';

    for (const [locationKey, userMap] of Object.entries(allData)) {
      if (!userMap || typeof userMap !== 'object') continue;

      // Check if current user has edits for this location
      const userKey = `${currentUser}-futurenote`;
      console.log('[Edit History] Checking location:', locationKey, 'for users:', Object.keys(userMap));
      if (userMap[userKey] || userMap[currentUser]) {
        const dateMap = userMap[userKey] || userMap[currentUser];
        if (dateMap && typeof dateMap === 'object') {

          // Extract UUID from location key (decode if needed)
          let decodedPath = locationKey;
          try {
            decodedPath = decodeURIComponent(locationKey);
          } catch {}

          // Extract location UUID from paths like /team/location/{uuid} or /team/location/{uuid}/services/{serviceId}/other-info
          const locationMatch = decodedPath.match(/\/team\/location\/([a-f0-9-]+)/);
          const locationUuid = locationMatch ? locationMatch[1] : null;

          if (locationUuid && locationUuid.match(/^[a-f0-9-]+$/)) {
            locationUuids.add(locationUuid);

            // Determine the page type from the path
            let pageType = 'Location';
            if (decodedPath.includes('/services/')) {
              pageType = 'Service';
            } else if (decodedPath.includes('/other-info')) {
              pageType = 'Other Info';
            }

            // Process each edit date
            for (const [dateKey, noteVal] of Object.entries(dateMap)) {
              const info = parseWhen(dateKey, noteVal);
              if (info) {
                userEdits.push({
                  locationUuid,
                  fullPath: decodedPath,
                  pageType,
                  date: info.date,
                  dateOnly: info.dateOnly,
                  note: typeof noteVal === 'string' ? noteVal : (noteVal?.note || 'Edit')
                });
              }
            }
          }
        }
      }
    }

    // Get current page UUID for highlighting
    const currentPageUuid = getCurrentPageUuid();

    // Initialize location details - start empty, populate as fetched
    const locationDetails = {};
    const loadedUuids = new Set();
    Array.from(locationUuids).forEach(uuid => {
      locationDetails[uuid] = {
        orgName: null,
        locationName: null,
        isCurrentPage: uuid === currentPageUuid,
        isLoading: true
      };
    });

    // Show initial content immediately with placeholders
    progress.textContent = 'Loading location details...';
    console.log('[Edit History] Initial render with placeholders');

    // Clear loading and show initial content
    modal.removeChild(loading);
    modal.removeChild(progress);

    // Group edits first with placeholder data
    const editsByDate = groupEditsByDate(userEdits, locationDetails);

    // Render initial content
    renderEditHistory(editsByDate, locationDetails, modal, currentPageUuid);

    // Now fetch details progressively and update UI
    const fetchPromises = Array.from(locationUuids).map(async (uuid) => {
      console.log(`[Edit History] 🔄 Fetching details for UUID: ${uuid}`);
      const data = await fetchLocationDetails(uuid);

      console.log(`[Edit History] 📦 Raw data for ${uuid}:`, data);
      console.log(`[Edit History] 🏢 Org: "${data.org}", Name: "${data.name}"`);

      // Check if we got valid data (fetchLocationDetails returns empty strings on error)
      const hasValidData = data.org && data.name;

      // Update the location details
      locationDetails[uuid] = {
        orgName: hasValidData ? data.org : null,
        locationName: hasValidData ? data.name : null,
        isCurrentPage: uuid === currentPageUuid,
        isLoading: false,
        hasData: hasValidData
      };

      if (hasValidData) {
        console.log(`[Edit History] ✅ Got valid data for ${uuid}: "${data.org}" - "${data.name}"`);
        loadedUuids.add(uuid);
        addLocationToUI(uuid, locationDetails[uuid]);
      } else {
        console.warn(`[Edit History] ⚠️ No valid data for ${uuid} - org:"${data.org}" name:"${data.name}"`);
        console.warn(`[Edit History] 🔍 This could be due to:`);
        console.warn(`[Edit History]   - API timeout (504)`);
        console.warn(`[Edit History]   - CORS errors`);
        console.warn(`[Edit History]   - Missing organization/name in database`);
        console.warn(`[Edit History]   - Invalid UUID`);
      }
    });

    // Function to add a location to the UI when it's successfully loaded
    function addLocationToUI(uuid, details) {
      // Re-render the entire edit history with updated data
      const editsByDate = groupEditsByDate(userEdits, locationDetails);
      renderEditHistory(editsByDate, locationDetails, modal, currentPageUuid);
    }

    // Helper function to group edits by date
    function groupEditsByDate(userEdits, locationDetails) {
      const editsByDate = {};
      userEdits.forEach(edit => {
        const dateStr = edit.date.toLocaleDateString();
        if (!editsByDate[dateStr]) {
          editsByDate[dateStr] = {};
        }

        // Group by location UUID, but track different page types
        const key = edit.locationUuid;
        if (!editsByDate[dateStr][key]) {
          editsByDate[dateStr][key] = {
            locationUuid: edit.locationUuid,
            totalCount: 0,
            latestDate: edit.date,
            pageTypes: {}
          };
        }

        // Track edits by page type within this location
        if (!editsByDate[dateStr][key].pageTypes[edit.pageType]) {
          editsByDate[dateStr][key].pageTypes[edit.pageType] = {
            count: 0,
            notes: [],
            fullPath: edit.fullPath
          };
        }

        editsByDate[dateStr][key].totalCount++;
        editsByDate[dateStr][key].pageTypes[edit.pageType].count++;
        editsByDate[dateStr][key].pageTypes[edit.pageType].notes.push(edit.note);

        if (edit.date > editsByDate[dateStr][key].latestDate) {
          editsByDate[dateStr][key].latestDate = edit.date;
        }
      });
      return editsByDate;
    }

    // Helper function to render the complete edit history
    function renderEditHistory(editsByDate, locationDetails, modal, currentPageUuid) {
      // Clear any existing content (except header)
      while (modal.children.length > 1) {
        modal.removeChild(modal.lastChild);
      }

      if (Object.keys(editsByDate).length === 0) {
        const noEdits = document.createElement('div');
        noEdits.textContent = 'No edit history found for your account.';
        noEdits.style.textAlign = 'center';
        noEdits.style.padding = '20px';
        noEdits.style.color = '#666';
        modal.appendChild(noEdits);
        return;
      }

    // Separate current page edits from others - only include loaded locations
    const currentPageEdits = {};
    const otherEdits = {};

    Object.entries(editsByDate).forEach(([dateStr, locations]) => {
      Object.entries(locations).forEach(([uuid, data]) => {
        const details = locationDetails[uuid];

        // Only include locations that have been successfully loaded with names
        if (details && details.orgName && details.locationName) {
          if (details.isCurrentPage) {
            if (!currentPageEdits[dateStr]) currentPageEdits[dateStr] = {};
            currentPageEdits[dateStr][uuid] = data;
          } else {
            if (!otherEdits[dateStr]) otherEdits[dateStr] = {};
            otherEdits[dateStr][uuid] = data;
          }
        }
      });
    });

    // Function to render edits section
    function renderEditsSection(editsData, title, isHighlighted = false) {
      if (Object.keys(editsData).length === 0) return;

      if (title) {
        const sectionTitle = document.createElement('h2');
        sectionTitle.textContent = title;
        sectionTitle.style.fontSize = '18px';
        sectionTitle.style.margin = '20px 0 15px 0';
        sectionTitle.style.color = isHighlighted ? '#0066cc' : '#333';
        sectionTitle.style.borderBottom = '2px solid ' + (isHighlighted ? '#0066cc' : '#eee');
        sectionTitle.style.paddingBottom = '5px';
        modal.appendChild(sectionTitle);
      }

      const sortedDates = Object.keys(editsData).sort((a, b) => new Date(b) - new Date(a));

      sortedDates.forEach(dateStr => {
        const dateGroup = document.createElement('div');
        dateGroup.style.marginBottom = '20px';

        const dateHeader = document.createElement('h3');
        dateHeader.textContent = dateStr;
        dateHeader.style.fontSize = '16px';
        dateHeader.style.margin = '0 0 10px 0';
        dateHeader.style.color = '#333';
        dateHeader.style.borderBottom = '1px solid #eee';
        dateHeader.style.paddingBottom = '5px';

        dateGroup.appendChild(dateHeader);

        const locations = editsData[dateStr];
        Object.entries(locations).forEach(([uuid, data]) => {
          const locationContainer = document.createElement('div');
          locationContainer.style.marginBottom = '8px';
          locationContainer.style.border = '1px solid #e0e0e0';
          locationContainer.style.borderRadius = '4px';
          locationContainer.style.backgroundColor = isHighlighted ? '#f0f8ff' : '#f9f9f9';

          // Main location row
          const locationDiv = document.createElement('div');
          locationDiv.style.display = 'flex';
          locationDiv.style.alignItems = 'center';
          locationDiv.style.padding = '8px';

          // Hyperlinked Org-Location name (no UUID shown) - only loaded items shown
          const details = locationDetails[uuid];
          const nameLink = document.createElement('a');
          nameLink.href = `https://gogetta.nyc/team/location/${uuid}`;
          nameLink.target = '_blank';
          nameLink.textContent = `${details.orgName} - ${details.locationName}`;
          nameLink.setAttribute('data-uuid', uuid);
          nameLink.style.flex = '1';
          nameLink.style.fontSize = '14px';
          nameLink.style.color = '#0066cc';
          nameLink.style.textDecoration = 'none';
          nameLink.style.marginRight = '10px';

          nameLink.addEventListener('mouseenter', () => {
            nameLink.style.textDecoration = 'underline';
          });

          nameLink.addEventListener('mouseleave', () => {
            nameLink.style.textDecoration = 'none';
          });

          // Total edit count and latest date
          const statsDiv = document.createElement('div');
          statsDiv.textContent = `${data.totalCount} edit${data.totalCount > 1 ? 's' : ''} • ${data.latestDate.toLocaleTimeString()}`;
          statsDiv.style.fontSize = '12px';
          statsDiv.style.color = '#666';
          statsDiv.style.textAlign = 'right';
          statsDiv.style.minWidth = '120px';

          locationDiv.appendChild(nameLink);
          locationDiv.appendChild(statsDiv);
          locationContainer.appendChild(locationDiv);

        // Page type breakdown
        if (Object.keys(data.pageTypes).length > 1 || Object.keys(data.pageTypes)[0] !== 'Location') {
          Object.entries(data.pageTypes).forEach(([pageType, pageData]) => {
            const pageDiv = document.createElement('div');
            pageDiv.style.display = 'flex';
            pageDiv.style.alignItems = 'center';
            pageDiv.style.padding = '4px 8px 4px 220px'; // Indent to align with location name
            pageDiv.style.fontSize = '12px';
            pageDiv.style.color = '#666';
            pageDiv.style.backgroundColor = '#fff';
            pageDiv.style.borderTop = '1px solid #eee';

            const pageTypeSpan = document.createElement('span');
            pageTypeSpan.textContent = `${pageType}: ${pageData.count} edit${pageData.count > 1 ? 's' : ''}`;
            pageTypeSpan.style.flex = '1';

            // If it's a service page, show link to that specific page
            if (pageData.fullPath && pageData.fullPath.includes('/services/')) {
              const serviceLink = document.createElement('a');
              serviceLink.href = `https://gogetta.nyc${pageData.fullPath}`;
              serviceLink.target = '_blank';
              serviceLink.textContent = '→';
              serviceLink.style.color = '#0066cc';
              serviceLink.style.textDecoration = 'none';
              serviceLink.style.marginLeft = '8px';
              pageDiv.appendChild(serviceLink);
            }

            pageDiv.appendChild(pageTypeSpan);
            locationContainer.appendChild(pageDiv);
          });
        }

          dateGroup.appendChild(locationContainer);
        });

        modal.appendChild(dateGroup);
      });
    }

      // Render current page edits first (highlighted)
      renderEditsSection(currentPageEdits, 'Your Edits on This Location', true);

      // Render other edits in chronological order
      renderEditsSection(otherEdits, 'Your Other Location Edits', false);
    }

  } catch (err) {
    console.error('[Edit History] Error loading data:', err);

    // Clear modal content except header
    while (modal.children.length > 1) {
      modal.removeChild(modal.lastChild);
    }

    const errorDiv = document.createElement('div');
    errorDiv.textContent = `Error loading edit history: ${err.message}`;
    errorDiv.style.textAlign = 'center';
    errorDiv.style.padding = '20px';
    errorDiv.style.color = '#d32f2f';
    modal.appendChild(errorDiv);
  }
}

// Add Edit History button
createButton('Edit History', async () => {
  console.log('[Edit History] 🖱️ Button clicked for UUID:', uuid);
  try {
    let currentUser = null;

    // Try multiple methods to get the username
    try {
      const { accessToken, username: cognitoUsername } = getCognitoTokens();
      currentUser = accessToken ? cognitoUsername : null;
      console.log('[Edit History] Got user from getCognitoTokens:', currentUser);
    } catch (err) {
      console.warn('[Edit History] getCognitoTokens failed:', err);
    }

    // Fallback: try the snackbar method
    if (!currentUser) {
      try {
        if (window.gghostUserName) {
          currentUser = window.gghostUserName;
          console.log('[Edit History] Got user from window.gghostUserName:', currentUser);
        } else if (typeof window.getUserNameSafely === "function") {
          currentUser = await window.getUserNameSafely();
          console.log('[Edit History] Got user from getUserNameSafely:', currentUser);
        }
      } catch (err) {
        console.warn('[Edit History] Fallback username methods failed:', err);
      }
    }

    if (!currentUser) {
      alert('Edit History: Unable to determine your username. Please make sure you are logged in.');
      return;
    }

    await showEditHistoryOverlay(uuid, currentUser);
  } catch (err) {
    console.error('[Edit History] 🛑 Error:', err);
    alert(`Edit History error: ${err.message}`);
  }
});

console.log('[YP Mini] 🔧 Creating YP Mini button for UUID:', uuid);
const ypMiniBtn = createButton('YP Mini', async () => {
console.log('[YP Mini] 🖱️ Button clicked!');
try {
  if (!uuid) {
    console.error('[YP Mini] ❌ UUID is undefined or empty');
    alert('YP Mini: Location UUID not found. Make sure you are on a valid location page.');
    return;
  }

  console.log('[YP Mini] 🔄 Fetching data for UUID:', uuid);
  const apiUrl = `https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`;
  
  const res = await fetch(apiUrl);
  
  if (!res.ok) {
    console.error('[YP Mini] ❌ API request failed:', res.status, res.statusText);
    const errorText = await res.text();
    console.error('[YP Mini] ❌ Error response:', errorText);
    alert(`YP Mini fetch failed: ${res.status} ${res.statusText}`);
    return;
  }

  const data = await res.json();
  console.log('[YP Mini] ✅ API response:', data);

  // 🟢 record validation timestamp
  await maybeRecordValidation(uuid, data);

  const slug = data.slug;
  const services = data.Services || [];

  if (slug) {
    console.log('[YP Mini] ✅ Found slug:', slug);
    ypMiniBtn.element.style.display = "none"; 
    createYourPeerEmbedWindow(slug, services, () => {
      ypMiniBtn.element.style.display = "block"; 
    });
  } else {
    console.warn('[YP Mini] ❌ Slug not found in response.');
    console.warn('[YP Mini] ❌ Available data keys:', Object.keys(data));
    alert('YP Mini: No slug found for this location. This location may not be available on YourPeer.');
  }
} catch (err) {
  console.error('[YP Mini] 🛑 Error fetching slug:', err);
  console.error('[YP Mini] 🛑 Error details:', err.message, err.stack);
  alert(`YP Mini error: ${err.message}`);
}

});
if (!document.getElementById("gg-note-overlay")) {
  try {
const { accessToken, username: cognitoUsername } = getCognitoTokens();
const userName = accessToken ? cognitoUsername : null;
 
if (!userName && !location.pathname.startsWith('/find/')) {
  console.warn("[📝 Notes] Username not set. Prompting user to click the extension icon.");
  const banner = document.createElement("div");
  banner.id = "gg-note-username-banner";
  banner.textContent = "Click the extension icon and type your name to enable notes";
  Object.assign(banner.style, {
    position: "fixed",
    top: "80px",
    right: "20px",
    background: "#ffe0e0",
    color: "#800",
    padding: "10px 14px",
    border: "2px solid #f00",
    borderRadius: "6px",
    fontSize: "13px",
    zIndex: 99999,
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
  });
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 10000);
  return;
}
const res = await fetch(`${baseURL}locationNotes.json`);
const allData = await res.json();
const data = allData?.[uuid] || {};
            const notesArray = [];
    let allNotesContent = "";
if (data && typeof data === 'object' && Object.keys(data).length > 0) {
  for (const user in data) {
    if (typeof data[user] === 'object') {
      for (const date in data[user]) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        notesArray.push({
          user: user,
          date: date,
          note: escapeHtml(data[user][date])
        });
      }
    }
  }
  notesArray.sort((a, b) => new Date(a.date) - new Date(b.date));
  allNotesContent = notesArray.map(n => `${n.user} (${n.date}): ${n.note}`).join("\n\n");
}
document.getElementById("gg-note-overlay")?.remove();
document.getElementById("gg-note-wrapper")?.remove();
    const noteBox = document.createElement("div");
    noteBox.id = "gg-note-overlay";
    const isFindMode = location.pathname.startsWith('/find/');
    const isEditable = !isFindMode && !!userName;
noteBox.contentEditable = isEditable ? "true" : "false";
noteBox.dataset.userName = userName || "";
    noteBox.style.pointerEvents = 'auto';
    noteBox.addEventListener("click", () => {
        if (isEditable) {
            noteBox.focus();
        }
    });
    noteBox.style.position = 'fixed';
    noteBox.style.zIndex = 999999; 
    console.log('🧩 Note box added to DOM:', document.getElementById('gg-note-overlay'));
noteBox.style.scrollPaddingBottom = '40px';
    Object.assign(noteBox.style, {
        position: "fixed",
        top: "100px",
        right: "20px",
        width: "300px",
        minHeight: "150px", 
        maxHeight: "400px", 
        background: "#fff",
        border: "2px solid #000",
        borderRadius: "8px",
        padding: "10px",
        fontSize: "14px",
        overflowY: "auto",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        zIndex: 9999,
        whiteSpace: "pre-wrap",
        cursor: isEditable ? "text" : "default" 
    });
    if (isFindMode || !userName) { 
        noteBox.style.background = "#f9f9f9"; 
        noteBox.style.cursor = "default";
        noteBox.setAttribute("aria-label", "Location notes (Read-only)");
        noteBox.innerText = allNotesContent || "(No notes available for this location)";
        if (!isFindMode && !userName) {
             noteBox.innerText = "(Set a username in the extension popup to add notes)\n\n" + (allNotesContent || "(No notes available for this location)");
        }
    } else { 
        noteBox.style.background = "#e6ffe6"; 
        noteBox.setAttribute("aria-label", "Editable location notes. Previous notes are read-only.");
        let currentUserNoteForToday = "";
        if (data && data[userName] && data[userName][today]) {
            currentUserNoteForToday = data[userName][today];
        }
const noteWrapper = document.createElement("div");
noteWrapper.id = "gg-note-wrapper";
const savedPos = JSON.parse(localStorage.getItem("ggNotePosition") || "{}");
const defaultTop = 100;
const defaultLeft = 20;
noteWrapper.style.top = `${Math.max(40, savedPos.top || defaultTop)}px`;  
noteWrapper.style.left = `${Math.max(0, savedPos.left || defaultLeft)}px`;
Object.assign(noteWrapper.style, {
  position: "fixed",
  right: "20px",
  width: "320px",
  maxHeight: "500px",
  background: "#fff",
  border: "2px solid #000",
  borderRadius: "8px",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  fontSize: "14px",
  zIndex: 9999,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column"
});
const dragBar = document.createElement("div");
let orgName = "";
let locationName = "";
const currentUuid = (fullServiceMatch || teamMatch || findMatch)?.[1];
if (currentUuid) {
  try {
    console.log(`[Notes Header] Attempting to fetch details for UUID: ${currentUuid}`);
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${currentUuid}`);
    if (!res.ok) {
      throw new Error(`API request failed with status ${res.status}`);
    }
    const data = await res.json();
    orgName = data.Organization?.name || "";
    locationName = data.name || "";
    if (orgName || locationName) {
      localStorage.setItem("ypLastViewedService", JSON.stringify({
        org: orgName,
        location: locationName,
        uuid: currentUuid
      }));
      console.log(`[Notes Header] Successfully fetched and stored: Org='${orgName}', Location='${locationName}' for UUID='${currentUuid}'`);
    } else {
      console.warn(`[Notes Header] API returned data but orgName or locationName is missing for UUID: ${currentUuid}. Data:`, data);
    }
  } catch (err) {
    console.error(`[Notes Header] 🛑 Failed to fetch details from API for UUID ${currentUuid}:`, err);
    const stored = JSON.parse(localStorage.getItem("ypLastViewedService") || '{}');
    if (stored.uuid === currentUuid) { 
      orgName = stored.org || "";
      locationName = stored.location || "";
      console.log(`[Notes Header] Used fallback localStorage data: Org='${orgName}', Location='${locationName}' for UUID='${currentUuid}'`);
    } else {
      console.warn(`[Notes Header] localStorage data is for a different UUID (stored: ${stored.uuid}, current: ${currentUuid}) or missing.`);
    }
  }
} else {
  console.warn("[Notes Header] UUID is not available. Cannot fetch details.");
  const stored = JSON.parse(localStorage.getItem("ypLastViewedService") || '{}');
}let headerSpan = document.createElement("span");
if (orgName || locationName) {
  headerSpan.textContent = `⋮ ${orgName}${locationName ? ' - ' + locationName : ''}`;
} else {
  headerSpan.textContent = `⋮ notes`;
}
headerSpan.style.userSelect = "none";
headerSpan.style.webkitUserSelect = "none";

dragBar.textContent = ""; // clear before appending
dragBar.style.cursor = "grab";
dragBar.appendChild(headerSpan);

// double-click copy only the header text (not buttons)
headerSpan.addEventListener("dblclick", async (e) => {
  e.stopPropagation();
  e.preventDefault();

  const text = headerSpan.textContent.replace(/^⋮\s*/, "");
  try {
    await navigator.clipboard.writeText(text);
    console.log(`[Notes Header] Copied to clipboard: "${text}"`);
    // Optional feedback
    headerSpan.style.backgroundColor = "#e0ffe0";
    setTimeout(() => headerSpan.style.backgroundColor = "", 300);
  } catch (err) {
    console.error("Clipboard copy failed:", err);
  }
});

// Now append your button separately
const toggleButton = document.createElement("button");
toggleButton.id = "notes-toggle-button";
toggleButton.innerText = "Show Other Branches";
toggleButton.style.marginLeft = "10px";
toggleButton.style.fontSize = "14px";
toggleButton.style.padding = "5px 10px";
toggleButton.style.border = "2px solid #000";
toggleButton.style.borderRadius = "4px";
toggleButton.style.cursor = "pointer";
toggleButton.addEventListener("click", toggleConnectionMode);
dragBar.appendChild(toggleButton);

Object.assign(dragBar.style, {
  background: "#eee",
  padding: "6px 10px",
  cursor: "grab",
  fontWeight: "bold",
  borderBottom: "1px solid #ccc"
});
noteWrapper.appendChild(dragBar);
const readOnlyDiv = document.createElement("div");
readOnlyDiv.id = "readonly-notes";
Object.assign(readOnlyDiv.style, {
  background: "#f9f9f9",
  padding: "10px",
  overflowY: "auto",
  maxHeight: "200px",
  borderBottom: "1px solid #ccc",
  fontSize: "13px",
  fontStyle: "italic"
});

if (notesArray.length > 0) {
  notesArray
    .filter(n => !(n.user === userName && n.date === today && n.note.trim().toLowerCase() !== "revalidated123435355342"))
    .forEach(n => {
      const container = document.createElement("div");
      container.style.marginBottom = "10px";

      const safeUser = n.user === 'doobneek'
        ? `<a href="http://localhost:3210" target="_blank" rel="noopener noreferrer"><strong>doobneek</strong></a>`
        : `<strong>${escapeHtml(n.user)}</strong>`;

      const displayNote = n.note.trim().toLowerCase() === "revalidated123435355342"
        ? "Revalidated"
        : escapeHtml(n.note);

      container.innerHTML = `${safeUser} (${n.date}):<br>${displayNote}`;

      const isReminder = n.user === "reminder";
      const today = new Date().toISOString().slice(0, 10);
      const isDue = n.date <= today;
      const isDone = /\n?\s*Done by .+$/i.test(n.note.trim());

      if (isReminder && isDue && !isDone) {
        const btn = document.createElement("button");
        btn.textContent = "Done?";
        btn.style.marginTop = "5px";

        btn.addEventListener("click", async () => {
          const updatedNote = `${n.note.trim()}\n\nDone by ${userName}`;
          try {
            const response = await postToNoteAPI({
                uuid,
                date: n.date,
                note: updatedNote,
                userName: "reminder"
              });
            await checkResponse(response, "Marking reminder done");
            btn.textContent = "Thanks!";
            btn.disabled = true;
            btn.style.backgroundColor = "#ccc";
          } catch (err) {
            console.error("❌ Failed to mark done", err);
            alert("Failed to update reminder.");
          }
        });

        container.appendChild(document.createElement("br"));
        container.appendChild(btn);
      }

      readOnlyDiv.appendChild(container);
    });
} else {
  readOnlyDiv.innerHTML = "<i>(No past notes available)</i>";
}

noteWrapper.appendChild(readOnlyDiv);

// After readOnlyDiv is populated:
await addValidationHistoryBadge(readOnlyDiv, uuid);

// ⬇️ Add this call
await injectSiteVisitUI({
  parentEl: readOnlyDiv,
  uuid,                       // same uuid you already computed above
  userName,                   // current user (already resolved earlier)
  NOTE_API,                   // "https://locationnote1-iygwucy2fa-uc.a.run.app"
  today,                       // you already have const today = new Date().toISOString().slice(0, 10);
  done:false
});
const reminderToggleWrapper = document.createElement("div");
Object.assign(reminderToggleWrapper.style, {
  padding: "10px",
  background: "#f0f0f0",
  borderTop: "1px solid #ccc"
});
const reminderCheckbox = document.createElement("input");
reminderCheckbox.type = "checkbox";
reminderCheckbox.id = "reminder-toggle";
const reminderLabel = document.createElement("label");
reminderLabel.setAttribute("for", "reminder-toggle");
reminderLabel.textContent = " Revisit this location";
reminderLabel.style.marginLeft = "5px";
reminderToggleWrapper.appendChild(reminderCheckbox);
reminderToggleWrapper.appendChild(reminderLabel);
noteWrapper.appendChild(reminderToggleWrapper);
editableDiv.id = "editable-note";
editableDiv.contentEditable = isEditable ? "true" : "false";
editableDiv.innerText =
  currentUserNoteForToday?.trim().toLowerCase() === "revalidated123435355342"
    ? ""
    : currentUserNoteForToday || "";
Object.assign(editableDiv.style, {
  background: isEditable ? "#e6ffe6" : "#f0f0f0",
  padding: "10px",
  flexGrow: 1,
  overflowY: "auto",
  cursor: isEditable ? "text" : "default",
  whiteSpace: "pre-wrap"
});
if (isEditable) {
  editableDiv.setAttribute("role", "textbox");
  editableDiv.setAttribute("tabindex", "0");
  editableDiv.addEventListener("paste", (e) => {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  selection.deleteFromDocument();
  const range = selection.getRangeAt(0);
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
  editableDiv.dispatchEvent(new Event("input", { bubbles: true }));
});
  let saveTimeout = null;
editableDiv.addEventListener("input", () => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const note = editableDiv.innerText.trim();
    const payload = {
      uuid,
      date: today,
      note: note || null,
      userName: getCurrentUsername()
    };
    try {
      const response = await postToNoteAPI(payload);
      await checkResponse(response, note ? "Saving note" : "Deleting note");
      console.log(note ? `[📝 Saved ${userName}'s note for ${today}]` : `[🗑️ Deleted ${userName}'s note for ${today}]`);
    } catch (err) {
      console.error("[❌ Failed to save/delete note]", err);
      alert(err.message);
    }
  }, 1000);
});
}
noteWrapper.appendChild(editableDiv);
const noteActionWrapper = document.createElement("div");
noteActionWrapper.style.padding = "10px";
noteActionWrapper.style.borderTop = "1px dashed #ccc";
noteActionWrapper.style.display = "flex";
noteActionWrapper.style.justifyContent = "space-between";
const revalidationCode = "revalidated123435355342";
const userNoteForToday = data?.[userName]?.[today] || null;
const isRevalidatedToday = userNoteForToday?.trim().toLowerCase() === revalidationCode;
// Create the wrapper + checkbox (initially hidden)
const checkboxWrapper = document.createElement("div");
checkboxWrapper.style.padding = "10px";
checkboxWrapper.style.borderTop = "1px dashed #ccc";
checkboxWrapper.style.display = "none"; // start hidden
checkboxWrapper.style.alignItems = "center";

const revalidateCheckbox = document.createElement("input");
revalidateCheckbox.type = "checkbox";
revalidateCheckbox.id = "revalidate-checkbox";

const revalidateLabel = document.createElement("label");
revalidateLabel.setAttribute("for", "revalidate-checkbox");
revalidateLabel.textContent = " Revalidated";
revalidateLabel.style.marginLeft = "8px";

checkboxWrapper.appendChild(revalidateCheckbox);
checkboxWrapper.appendChild(revalidateLabel);
noteWrapper.appendChild(checkboxWrapper);

// Show/hide dynamically based on editableDiv contents
function toggleRevalidateCheckbox() {
  const noteEmpty = editableDiv.innerText.trim().length === 0;
  const alreadyRevalidated = isRevalidatedToday;

  // Show checkbox only if note is empty AND not already revalidated
  if (noteEmpty && !alreadyRevalidated) {
    checkboxWrapper.style.display = "flex";
  } else {
    checkboxWrapper.style.display = "none";
  }
}

editableDiv.addEventListener("input", toggleRevalidateCheckbox);
toggleRevalidateCheckbox(); // run once at load

// Save when checked
revalidateCheckbox.addEventListener("change", async () => {
    if (revalidateCheckbox.checked) {
        try {
            await postToNoteAPI({
                    uuid,
                    date: today,
                    note: revalidationCode,
                    userName: getCurrentUsername()
                });
 revalidateLabel.textContent = ` Thanks, ${userName}`;

    revalidateCheckbox.style.display = "none";
                editableDiv.innerText = "";
            // update read-only notes...
        } catch (err) {
            console.error("❌ Failed to mark as revalidated:", err);
            revalidateCheckbox.checked = false;
        }
    }
});

const liveTranscribeBtn = document.createElement("button");
liveTranscribeBtn.textContent = "Start Transcribing";
liveTranscribeBtn.style.padding = "6px 12px";
liveTranscribeBtn.style.flex = "1";
liveTranscribeBtn.style.marginRight = "5px";
const aiFormatBtn = document.createElement("button");
aiFormatBtn.textContent = "Format with AI";
aiFormatBtn.style.padding = "6px 12px";
aiFormatBtn.style.flex = "1";
noteActionWrapper.appendChild(liveTranscribeBtn);
noteActionWrapper.appendChild(aiFormatBtn);
noteWrapper.appendChild(noteActionWrapper); 
aiFormatBtn.addEventListener("click", async () => {
  const rawNote = editableDiv.innerText.trim();
  if (!rawNote) {
    alert("Note is empty.");
    return;
  }
  aiFormatBtn.disabled = true;
  aiFormatBtn.textContent = "Formatting...";
  try {
  console.log("[AI Button] Raw note:", rawNote);
const response = await fetch("https://convertnotetostructuredinfo-iygwucy2fa-uc.a.run.app", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ noteText: rawNote })
});
console.log("[AI Button] Received response:", response);
    const data = await response.json();
    console.log("[AI Button] Parsed response JSON:", data);
    if (data.structuredInfo) {
      editableDiv.innerText = data.structuredInfo;
    } else {
      throw new Error(data.error || "No structured info returned");
    }
  } catch (err) {
    alert("doobneek couldn’t format your note with AI:\n" + err.message);
    console.error("[AI Format Error]", err);
  } finally {
    aiFormatBtn.disabled = false;
    aiFormatBtn.textContent = "🧠 Format with AI";
  }
});
if (!recognition && 'webkitSpeechRecognition' in window) {
  initializeSpeechRecognition();
}
liveTranscribeBtn.addEventListener("click", () => {
  if (!recognition) {
    alert("Speech recognition not available.");
    return;
  }
  const editableDiv = document.getElementById("editable-note");
  if (!editableDiv) {
    alert("Editable notes section not found.");
    return;
  }
  if (isRecognizing) {
    recognition.stop();
    liveTranscribeBtn.textContent = "Start Transcribing";
    return;
  }
  recognition.onstart = () => {
    isRecognizing = true;
    liveTranscribeBtn.textContent = "Stop Transcribing";
    console.log("[Live Transcribe] Started.");
  };
  recognition.onend = () => {
    isRecognizing = false;
    liveTranscribeBtn.textContent = "🎤 Start Transcribing";
    console.log("[Live Transcribe] Stopped.");
  };
  recognition.onerror = (event) => {
    isRecognizing = false;
    liveTranscribeBtn.textContent = "🎤 Start Transcribing";
    console.error("[Live Transcribe] Error:", event.error);
  };
  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        transcript += event.results[i][0].transcript;
      }
    }
    editableDiv.innerText += (editableDiv.innerText.length > 0 ? " " : "") + transcript;
  };
  try {
    recognition.start();
  } catch (err) {
    console.error("[Live Transcribe] Failed to start:", err);
    alert("Could not start transcription. Try again.");
  }
});
reminderCheckbox.addEventListener("change", () => {
  if (reminderCheckbox.checked) {
    showReminderModal(uuid, NOTE_API);
    reminderCheckbox.checked = false;
  }
});
let isDragging = false, offsetX = 0, offsetY = 0;
dragBar.addEventListener("mousedown", (e) => {
  isDragging = true;
  offsetX = e.clientX - noteWrapper.getBoundingClientRect().left;
  offsetY = e.clientY - noteWrapper.getBoundingClientRect().top;
  e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const wrapperRect = noteWrapper.getBoundingClientRect();
  const maxX = window.innerWidth - 40; 
  const maxY = window.innerHeight - 40; 
  const newX = Math.min(Math.max(100, e.clientX - offsetX), maxX);
  const newY = Math.min(Math.max(0, e.clientY - offsetY), maxY);
  noteWrapper.style.left = `${newX}px`;
  noteWrapper.style.top = `${newY}px`;
  localStorage.setItem("ggNotePosition", JSON.stringify({ left: newX, top: newY }));
});
document.addEventListener("mouseup", () => isDragging = false);
document.body.appendChild(noteWrapper);
    }
  } catch (err) {
    console.error("🛑 Failed to load or show editable note:", err);
  }
}
    const pendingUuidSession = sessionStorage.getItem('ypPendingRedirect');
    if (pendingUuidSession && path.startsWith('/find/location/')) { 
      console.log('[YPButton] 🧭 Landed on /find from team with YP intent (clearing pending)');
      sessionStorage.removeItem('ypPendingRedirect');
    }
    return; 
  }
  if (path === '/' || path=== '/find' || path === '/team') {
    const mostOutdatedBtn = createButton('Most outdated page', () => {
      const preloadUrl = "https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=70";
      window.location.href = preloadUrl;

      const timeout = 10000;
      const observer = new MutationObserver((mutationsList, obs) => {
        const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
        if (spanParent) {
          const spans = spanParent.querySelectorAll("span");
          if (spans.length === 3) {
            const totalPagesText = spans[2].textContent.trim();
            const totalPages = parseInt(totalPagesText, 10);
            if (!isNaN(totalPages)) {
              obs.disconnect();
              clearTimeout(observerTimeout);
              const finalUrl = `https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=${totalPages}`;
              if (window.location.href !== finalUrl) {
                window.location.href = finalUrl;
              }
            }
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      const observerTimeout = setTimeout(() => {
        observer.disconnect();
        console.warn("⏳ Timeout: Did not find pagination element.");
      }, timeout);
    });
    mostOutdatedBtn.setAttribute('data-most-outdated', 'true');
  }
}
async function initializeGoGettaEnhancements() {
  await injectGoGettaButtons();
  updateEditablePlaceholder() 
  onUrlChange(() => {
    injectGoGettaButtons(); 
    updateEditablePlaceholder()
  });
}
// ---- Limits (tune as needed) ----
const MAX_ORG_NAME = 140;
const MAX_NOTE_LEN = 4000;
const MAX_ADDR_LEN = 200;       // per address
const MAX_ADDR_TOTAL = 800;     // concatenated
const MAX_ADDR_COUNT = 8;
const MAX_EMAIL = 254;
const MAX_HOST = 255;
const MAX_PHONE = 32;

// ---- Sanitizers ----
function clampLen(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) : s;
}
function cleanText(s, max = 500) {
  // Trim, collapse spaces, remove dangerous control chars
  s = String(s || "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  return clampLen(s, max);
}
function cleanMultiline(s, max = MAX_NOTE_LEN) {
  // Allow newlines, strip controls except \n\r\t
  s = String(s || "").replace(/[^\S\r\n\t]+/g, " ").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
  return clampLen(s, max);
}
function sanitizePhone(raw) {
  // digits + + (leading), trim and cap
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  return clampLen(digits, MAX_PHONE);
}
function normalizeEmail(email) {
  return clampLen(String(email || "").trim().toLowerCase(), MAX_EMAIL);
}
function ensureHttpScheme(url) {
  // If user typed without scheme, default to https://
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
function normalizeWebsiteHost(url) {
  if (!url) return "";
  try {
    const u = new URL(ensureHttpScheme(url));
    return clampLen(u.hostname.toLowerCase(), MAX_HOST);
  } catch {
    return "";
  }
}
// Keep only the last 10 digits from any pasted phone string.
// If there are fewer than 10 digits, it will return what's there.
function getLast10Digits(str) {
  const digits = String(str || "").replace(/\D+/g, "");
  return digits.slice(-10);
}

// Accept "feasible" web addresses without requiring http.
// Rules: no spaces, no "javascript:" etc, contains at least one dot in host.
// We'll try to parse with https:// prefix to validate.
function isFeasibleLink(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (/\s/.test(s)) return false;
  if (/^javascript:|^data:|^file:/i.test(s)) return false;

  try {
    // Add scheme only for parsing
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    // must have at least one dot in hostname and only normal chars
    if (!/[.]/.test(url.hostname)) return false;
    if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// Normalize a website to just the hostname for your composite key.
// Accepts schemeless inputs.
function normalizeWebsiteHostLoose(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return (u.hostname || "").toLowerCase();
  } catch {
    // fallback: try to grab something like domain.tld from raw text
    const m = s.match(/([a-z0-9.-]+\.[a-z]{2,})/i);
    return m ? m[1].toLowerCase() : "";
  }
}

// You already have toFirebaseKey; keep or use this stricter one:
function toFirebaseKey(str) {
  if (typeof str !== "string") return "x";
  return str.trim().toLowerCase().replace(/[.#$/\[\]]/g, "_");
}
function fromFirebaseKey(str) {
  if (typeof str !== "string") return "";
  return str.replace(/_/g, ".");
}

// Build your composite key from last-10 phone + hostname + email
function buildFutureOrgKey({ phone, website, email }) {
  const p10 = getLast10Digits(phone) || "x";
  const host = normalizeWebsiteHostLoose(website) || "x";
  const em  = String(email || "").trim().toLowerCase() || "x";
  return `${toFirebaseKey(p10)}-${toFirebaseKey(host)}-${toFirebaseKey(em)}`;
}

// ---- Validators ----
function isValidPhone(p) {
  if (!p) return false;
  // 7–15 digits (allow one leading '+')
  const stripped = p.replace(/\D/g, "");
  return stripped.length >= 7 && stripped.length <= 15;
}
function isValidUrlStrict(u) {
  if (!u) return false;
  try {
    const url = new URL(ensureHttpScheme(u));
    if (!/^https?:$/i.test(url.protocol)) return false; // block javascript:, data:, etc
    // simple TLD-ish host check
    if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return false;
    if (!/[.]/.test(url.hostname)) return false; // require dot in host
    return true;
  } catch {
    return false;
  }
}
function isValidEmail(e) {
  if (!e) return false;
  // RFC-lite; good enough for UI validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
function cleanAddress(a) {
  // strip controls, trim, collapse spaces, cap length
  const s = cleanText(a, MAX_ADDR_LEN);
  // basic blacklist for script-y content
  if (/javascript:|data:|<script/i.test(s)) return "";
  return s;
}

// ---- Firebase key safe ----
function toFirebaseKey(str) {
  if (typeof str !== "string") return "x";
  return str.trim()
    .toLowerCase()
    .replace(/[.#$/\[\]]/g, "_"); // firebase-forbidden -> underscore
}

// ---- Composite Future Org key (phone-website-email) ----
function buildFutureOrgKey({ phone, website, email }) {
  const p = toFirebaseKey(sanitizePhone(phone) || "x");
  const w = toFirebaseKey(normalizeWebsiteHost(website) || "x");
  const e = toFirebaseKey(normalizeEmail(email) || "x");
  return `${p || "x"}-${w || "x"}-${e || "x"}`;
}

(async function () {

  // Function to check if current URL is a street-view page and trigger modal
  const checkAndShowStreetView = (url) => {
    // Strict URL matching - must end exactly with /questions/street-view or /questions/street-view/
    const streetViewPattern = /\/team\/location\/([a-f0-9-]+)\/questions\/street-view\/?$/;
    const match = url.match(streetViewPattern);

    if (match && match[1]) {
      const uuid = match[1];
      console.log('[gghost] Triggering Street View for UUID:', uuid, 'from URL:', url);

      try {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'showStreetView', uuid }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[gghost] Street View message error:', chrome.runtime.lastError.message);
              // Retry once after a short delay
              setTimeout(() => {
                try {
                  chrome.runtime.sendMessage({ type: 'showStreetView', uuid });
                } catch (retryError) {
                  console.error('[gghost] Street View retry failed:', retryError);
                }
              }, 1000);
            } else {
              console.log('[gghost] Street View message sent successfully');
            }
          });
        } else {
          console.warn('Extension context invalidated, cannot send message');
        }
      } catch (error) {
        console.warn('Extension context error:', error.message);
      }
    } else {
      // Only log if the URL contains street-view but doesn't match (for debugging)
      if (url.includes('street-view')) {
        console.log('[gghost] URL contains street-view but doesn\'t match pattern:', url);
      }
    }
  };

  // Check current URL immediately on load
  try {
    checkAndShowStreetView(location.href);
  } catch (error) {
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.warn('[gghost] Extension context invalidated on initial load');
      return;
    }
    console.error('[gghost] Initial street view check error:', error);
  }

  // Also check on URL changes
  onUrlChange((newUrl) => {
    checkAndShowStreetView(newUrl);
  });

  // --- GoGetta custom back/redirect logic ---
  function getGoGettaLocationUuid() {
    const path = location.pathname;
    const match = path.match(/\/team\/location\/([a-f0-9\-]{12,36})/);
    return match ? match[1] : null;
  }

  function isGoGettaLocationPage() {
    return /^\/team\/location\/[a-f0-9\-]{12,36}$/.test(location.pathname);
  }
  function isGoGettaClosureInfoPage() {
    return /^\/team\/location\/[a-f0-9\-]{12,36}\/closureinfo$/.test(location.pathname);
  }
  function isGoGettaIsClosedPage() {
    return /^\/team\/location\/[a-f0-9\-]{12,36}\/isClosed$/.test(location.pathname);
  }

  function getClosureInfoUrl(uuid) {
    return `https://gogetta.nyc/team/location/${uuid}/closureinfo`;
  }
  function getLocationUrl(uuid) {
    return `https://gogetta.nyc/team/location/${uuid}`;
  }

  // Intercept browser back button - DISABLED: Replaced with closure dialog system
  // window.addEventListener('popstate', function(e) {
  //   const uuid = getGoGettaLocationUuid();
  //   if (!uuid) return;
  //   if (isGoGettaLocationPage()) {
  //     // If on /location/:uuid, redirect to /closureinfo
  //     window.location.href = getClosureInfoUrl(uuid);
  //   } else if (isGoGettaClosureInfoPage()) {
  //     // If on /closureinfo, redirect to /location/:uuid
  //     window.location.href = getLocationUrl(uuid);
  //   }
  //   // Don't redirect from /isClosed anymore
  // });

  // Intercept <Back button clicks - DISABLED: Replaced with closure dialog system
  // document.addEventListener('click', function(e) {
  //   const t = e.target;
  //   if (t && t.tagName === 'BUTTON' && t.textContent && t.textContent.replace(/\s/g, '').startsWith('<Back')) {
  //     const uuid = getGoGettaLocationUuid();
  //     if (!uuid) return;
  //     if (isGoGettaLocationPage() || isGoGettaIsClosedPage()) {
  //       window.location.href = getClosureInfoUrl(uuid);
  //       e.preventDefault();
  //     } else if (isGoGettaClosureInfoPage()) {
  //       window.location.href = getLocationUrl(uuid);
  //       e.preventDefault();
  //     }
  //   }
  // }, true);

  await initializeGoGettaEnhancements();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (document.body.dataset.gghostRendered !== 'true') {
      injectGoGettaButtons();
    }
  }
});
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "userNameUpdated") {
      console.log("[gghost.js] Received userNameUpdated message:", request.userName);
      const existingOverlay = document.getElementById("gg-note-overlay");
      if (existingOverlay) {
        existingOverlay.remove();
      }
      window.gghostUserName = request.userName; 
      injectGoGettaButtons(); 
      sendResponse({ status: "Username received by content script" });
    }
    
    if (request.type === "GET_COGNITO_TOKENS") {
      console.log("[gghost.js] Popup requested Cognito tokens");
      const tokens = getCognitoTokens();
      console.log("[gghost.js] Sending tokens to popup:", { 
        hasAccessToken: !!tokens.accessToken, 
        hasIdToken: !!tokens.idToken, 
        username: tokens.username 
      });
      sendResponse(tokens);
    }
    
    if (request.type === "passwordUpdated") {
      const existingOverlay = document.getElementById("gg-note-overlay");
      if (existingOverlay) {
        existingOverlay.remove();
      }
      window.gghostPassword = request.userPassword; 
      injectGoGettaButtons(); 
      sendResponse({ status: "Pass received by content script" });
    }
    return true; 
  });
})();