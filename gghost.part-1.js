// GGHOST_PART_MARKER: gghost.part-1.js
window.__GGHOST_PARTS_LOADED__ = window.__GGHOST_PARTS_LOADED__ || [];
window.__GGHOST_PARTS_LOADED__.push('gghost.part-1.js');
console.log('[gghost] loaded gghost.part-1.js');
const GGHOST_TEAM_EDIT_RE = /^\/team\/location\/[0-9a-f-]+/i;
const shouldDeferGghost = GGHOST_TEAM_EDIT_RE.test(location.pathname || "") && !window.__GGHOST_DEFERRED__;
const waitForGghostIdle = () => {
  if (!shouldDeferGghost) return Promise.resolve();
  window.__GGHOST_DEFERRED__ = true;
  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer = null;
    let idleTimer = null;
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleIdle();
    };
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (idleTimer) clearTimeout(idleTimer);
    };
    const run = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const scheduleIdle = () => {
      if (settled) return;
      if (window.requestIdleCallback) {
        window.requestIdleCallback(run, { timeout: 3000 });
      } else {
        idleTimer = setTimeout(run, 1000);
      }
    };
    fallbackTimer = setTimeout(run, 3500);
    document.addEventListener("visibilitychange", onVisible);
    if (document.readyState === "complete" || document.readyState === "interactive") {
      scheduleIdle();
    } else {
      document.addEventListener("DOMContentLoaded", scheduleIdle, { once: true });
      window.addEventListener("load", scheduleIdle, { once: true });
    }
  });
};
  console.log('🚀 GGHOST.JS LOADING - URL:', window.location.href);
  let globalButtonDropdown = null;
  const buttonActions = [];
  let areaZipOverlayState = null;
// Check for extension context validity
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
  console.warn('Extension context may be invalidated');
}
const NOTE_API = "https://us-central1-streetli.cloudfunctions.net/locationNote1";
const EDIT_TIMELINE_API = window.gghost?.EDIT_TIMELINE_API
  || "https://us-central1-streetli.cloudfunctions.net/locationNotesTimeline";
const NOTE_API_SKIP_HOST_RE = /(^|\.)test\.gogetta\.nyc$|(^|\.)test\.yourpeer(\.nyc)?$/i;
const EDIT_TIMELINE_ENABLED = window.gghost?.EDIT_TIMELINE_ENABLED ?? true;
const EDIT_TIMELINE_FORCE = window.gghost?.EDIT_TIMELINE_FORCE ?? false;
const EDIT_TIMELINE_PREFETCH = window.gghost?.EDIT_TIMELINE_PREFETCH ?? false;
window.gghost = window.gghost || {};
window.gghost.NOTE_API = NOTE_API;
window.gghost.EDIT_TIMELINE_API = EDIT_TIMELINE_API;
window.gghost.EDIT_TIMELINE_ENABLED = EDIT_TIMELINE_ENABLED;
window.gghost.EDIT_TIMELINE_FORCE = EDIT_TIMELINE_FORCE;
window.gghost.EDIT_TIMELINE_PREFETCH = EDIT_TIMELINE_PREFETCH;
const baseURL = "https://streetli-default-rtdb.firebaseio.com/";
const NOTES_HIDDEN_CLASS = "gg-hide-notes";
const NOTES_HIDDEN_STORAGE_KEY = "hideNotes";
function ensureNotesHiddenStyle() {
  if (document.getElementById("gg-hide-notes-style")) return;
  const style = document.createElement("style");
  style.id = "gg-hide-notes-style";
  style.textContent = `
html.${NOTES_HIDDEN_CLASS} #gg-note-wrapper,
html.${NOTES_HIDDEN_CLASS} #gg-note-overlay,
html.${NOTES_HIDDEN_CLASS} #gg-note-username-banner {
  display: none !important;
}
`;
  (document.head || document.documentElement).appendChild(style);
}
function setNotesHidden(hidden) {
  ensureNotesHiddenStyle();
  document.documentElement.classList.toggle(NOTES_HIDDEN_CLASS, !!hidden);
}
function hasGghostNotesUi() {
  return !!(
    document.getElementById("gg-note-wrapper")
    || document.getElementById("gg-note-overlay")
    || document.getElementById("gg-note-username-banner")
  );
}
if (chrome?.storage?.local) {
  chrome.storage.local.get(NOTES_HIDDEN_STORAGE_KEY, (data) => {
    setNotesHidden(!!data?.[NOTES_HIDDEN_STORAGE_KEY]);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[NOTES_HIDDEN_STORAGE_KEY]) {
      setNotesHidden(!!changes[NOTES_HIDDEN_STORAGE_KEY].newValue);
    }
  });
}
let firebaseWriteDisabled = false;
let firebaseWriteDisableLogged = false;
let firebaseWriteMissingTokenLogged = false;
const FIREBASE_AUTH_TOKEN_STORAGE_KEY = "gghostFirebaseAuthToken";
function getFirebaseAuthToken() {
  const directToken = window.gghost?.firebaseAuthToken;
  if (typeof directToken === "string" && directToken.trim()) return directToken.trim();
  try {
    const storedToken = localStorage.getItem(FIREBASE_AUTH_TOKEN_STORAGE_KEY)
      || sessionStorage.getItem(FIREBASE_AUTH_TOKEN_STORAGE_KEY);
    if (storedToken && storedToken.trim()) return storedToken.trim();
  } catch (err) {
    // ignore storage access errors
  }
  return null;
}
function withFirebaseAuth(url) {
  const token = getFirebaseAuthToken();
  if (!token) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}auth=${encodeURIComponent(token)}`;
}
function disableFirebaseWrites(reason) {
  firebaseWriteDisabled = true;
  if (!firebaseWriteDisableLogged) {
    console.warn("[Firebase] Disabling RTDB writes:", reason);
    firebaseWriteDisableLogged = true;
  }
}
window.gghost.baseURL = baseURL;
window.gghost.getFirebaseAuthToken = getFirebaseAuthToken;
window.gghost.withFirebaseAuth = withFirebaseAuth;
const LOCATION_INVOCATION_BUCKET_SECONDS = 1;
const INVOCATION_WRITES_ENABLED = false;
let locationInvocationDisabled = !INVOCATION_WRITES_ENABLED;
let locationInvocationDisableLogged = false;
function disableLocationInvocation(reason) {
  locationInvocationDisabled = true;
  if (!locationInvocationDisableLogged) {
    console.warn('[LocationInvocation] Disabled invocation writes:', reason);
    locationInvocationDisableLogged = true;
  }
}
function getInvocationBucketSeconds() {
  return Math.floor(Date.now() / 1000).toString();
}
async function recordLocationInvocation(uuid, source = 'unknown') {
  if (!uuid) return;
  if (locationInvocationDisabled) return;
  const bucket = getInvocationBucketSeconds();
  const url = withFirebaseAuth(`${baseURL}locationNotes/${uuid}/invocations/${bucket}.json`);
  try {
    const existingRes = await fetch(url, { cache: "no-store" });
    if (existingRes.status === 401 || existingRes.status === 403) {
      disableLocationInvocation('permission denied');
      return;
    }
    let current = 0;
    if (existingRes.ok) {
      const existing = await existingRes.json();
      if (typeof existing === "number") {
        current = existing;
      }
    }
    const next = current + 1;
    const writeRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    });
    if (!writeRes.ok) {
      const text = await writeRes.text().catch(() => "");
      if (writeRes.status === 401 || writeRes.status === 403 || text.includes('Permission denied')) {
        disableLocationInvocation('permission denied');
        return;
      }
      console.warn(`[LocationInvocation] Write failed for ${uuid}:`, text);
    }
  } catch (err) {
    console.warn(`[LocationInvocation] Failed to record invocation for ${uuid} (${source}):`, err);
  }
}
// Shared Cognito authentication utilities
window.gghost = window.gghost || {};
console.log('[gghost.js] Script loaded, setting up getCognitoTokens');
window.gghost.getCognitoTokens = function getCognitoTokens() {
  try {
    const prefix = 'CognitoIdentityServiceProvider.';
    const cognitoKeys = [];
    const candidates = [];
    const decodeJwtPayload = (token) => {
      if (!token || typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      try {
        return JSON.parse(atob(padded));
      } catch {
        return null;
      }
    };
    const getTokenExp = (token) => {
      const payload = decodeJwtPayload(token);
      const exp = payload?.exp;
      return Number.isFinite(exp) ? exp : 0;
    };
    const addCandidatesFromStorage = (storage, label) => {
      const clients = new Map();
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        cognitoKeys.push(key);
        const rest = key.slice(prefix.length);
        const parts = rest.split('.');
        if (parts.length < 2) continue;
        const clientId = parts[0];
        const tail = parts[parts.length - 1];
        const entry = clients.get(clientId) || { lastAuthUser: null, users: new Map() };
        if (tail === 'LastAuthUser') {
          entry.lastAuthUser = storage.getItem(key);
          clients.set(clientId, entry);
          continue;
        }
        if (!['accessToken', 'idToken', 'refreshToken'].includes(tail)) continue;
        const username = parts.slice(1, -1).join('.');
        if (!username) continue;
        const userTokens = entry.users.get(username) || {};
        userTokens[tail] = storage.getItem(key);
        entry.users.set(username, userTokens);
        clients.set(clientId, entry);
      }
      clients.forEach((entry, clientId) => {
        if (entry.lastAuthUser && entry.users.has(entry.lastAuthUser)) {
          const tokens = entry.users.get(entry.lastAuthUser);
          candidates.push({
            clientId,
            username: entry.lastAuthUser,
            storageLabel: label,
            isLastAuthUser: true,
            accessToken: tokens.accessToken || null,
            idToken: tokens.idToken || null,
            refreshToken: tokens.refreshToken || null
          });
        }
        entry.users.forEach((tokens, user) => {
          candidates.push({
            clientId,
            username: user,
            storageLabel: label,
            isLastAuthUser: entry.lastAuthUser === user,
            accessToken: tokens.accessToken || null,
            idToken: tokens.idToken || null,
            refreshToken: tokens.refreshToken || null
          });
        });
      });
    };
    console.log('[getCognitoTokens] Scanning storage for Cognito tokens...');
    const storages = [
      { storage: localStorage, label: 'localStorage' },
      { storage: sessionStorage, label: 'sessionStorage' }
    ];
    storages.forEach(({ storage, label }) => {
      try {
        if (!storage) return;
        addCandidatesFromStorage(storage, label);
      } catch (error) {
        console.warn(`[getCognitoTokens] Unable to access ${label}:`, error);
      }
    });
    const uniqueKeys = Array.from(new Set(cognitoKeys));
    console.log('[getCognitoTokens] Found Cognito keys:', uniqueKeys);
    const nowSec = Date.now() / 1000;
    let best = null;
    candidates.forEach((candidate) => {
      if (!candidate.accessToken && !candidate.idToken && !candidate.refreshToken) return;
      const accessExp = getTokenExp(candidate.accessToken);
      const idExp = getTokenExp(candidate.idToken);
      const maxExp = Math.max(accessExp || 0, idExp || 0);
      const accessValid = accessExp ? accessExp > nowSec + 30 : false;
      const idValid = idExp ? idExp > nowSec + 30 : false;
      const valid = accessValid || idValid || (!accessExp && !idExp);
      const tokenCount = (candidate.accessToken ? 1 : 0) + (candidate.idToken ? 1 : 0);
      const scored = { ...candidate, accessExp, idExp, maxExp, valid, tokenCount };
      if (!best) {
        best = scored;
        return;
      }
      if (scored.valid !== best.valid) {
        if (scored.valid) best = scored;
        return;
      }
      if (scored.tokenCount !== best.tokenCount) {
        if (scored.tokenCount > best.tokenCount) best = scored;
        return;
      }
      if (scored.maxExp !== best.maxExp) {
        if (scored.maxExp > best.maxExp) best = scored;
        return;
      }
      if (scored.isLastAuthUser !== best.isLastAuthUser) {
        if (scored.isLastAuthUser) best = scored;
      }
    });
    const accessToken = best?.accessToken || null;
    const idToken = best?.idToken || null;
    const refreshToken = best?.refreshToken || null;
    const username = best?.username || null;
    if (best) {
      console.log('[getCognitoTokens] Selected tokens from', best.storageLabel, 'client', best.clientId, 'user', best.username);
    }
    console.log('[getCognitoTokens] Result:', {
      hasAccessToken: !!accessToken,
      hasIdToken: !!idToken,
      hasRefreshToken: !!refreshToken,
      username
    });
    return { accessToken, idToken, refreshToken, username };
  } catch (error) {
    console.warn('[getCognitoTokens] Error accessing localStorage:', error);
    return { accessToken: null, idToken: null, refreshToken: null, username: null };
  }
};
// Local reference for this file
const getCognitoTokens = window.gghost.getCognitoTokens;
function getAuthHeaders() {
  console.log('[getAuthHeaders] Getting auth headers...');
  const { accessToken, idToken } = getCognitoTokens();
  const token = accessToken || idToken;
  if (token) {
    console.log('[getAuthHeaders] Using JWT token');
    return {
      'Authorization': `Bearer ${token}`,
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
function shouldSkipNoteApi() {
  const host = location?.hostname || '';
  return NOTE_API_SKIP_HOST_RE.test(host);
}
function fetchViaBackground(url, options = {}) {
  const fetchWithCorsFix = () => {
    try {
      const targetOrigin = new URL(url, window.location.href).origin;
      const pageOrigin = window.location.origin;
      if (options?.credentials === 'include' && targetOrigin !== pageOrigin) {
        return fetch(url, { ...options, credentials: 'omit' });
      }
    } catch (_err) {
      // fall back to default fetch
    }
    return fetch(url, options);
  };
  if (window.__gghostBackgroundFetchUnavailable || !chrome?.runtime?.sendMessage) {
    return fetchWithCorsFix();
  }
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: 'BACKGROUND_FETCH', url, options }, (response) => {
        let lastError = null;
        try {
          lastError = chrome?.runtime?.lastError;
        } catch (err) {
          reject(err);
          return;
        }
        if (lastError) {
          if (String(lastError.message || '').toLowerCase().includes('extension context invalidated')) {
            window.__gghostBackgroundFetchUnavailable = true;
          }
          reject(new Error(lastError.message || 'Background fetch failed'));
          return;
        }
        if (!response) {
          reject(new Error('Background fetch returned no response'));
          return;
        }
        const headers = new Headers(response.headers || {});
        const rawStatus = typeof response.status === 'number' ? response.status : 0;
        const status = rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 503;
        const statusText = response.statusText || (rawStatus ? '' : 'fetch failed');
        const method = String(options?.method || 'GET').toUpperCase();
        const isNullBodyStatus = status === 204 || status === 205 || status === 304 || method === 'HEAD';
        const body = isNullBodyStatus ? null : (response.body || '');
        resolve(new Response(body, { status, statusText, headers }));
      });
    } catch (err) {
      reject(err);
    }
  }).catch((err) => {
    console.warn('[BackgroundFetch] Falling back to window.fetch:', err);
    return fetchWithCorsFix();
  });
}
async function fetchLocationsByRadiusViaExtension(query) {
  if (!chrome?.runtime?.sendMessage) {
    return null;
  }
  try {
    const response = await sendBackgroundRequest({ type: 'FETCH_LOCATIONS_BY_RADIUS', query });
    if (!response || !response.ok) {
      throw new Error(response?.error || 'Extension failed to fetch locations');
    }
    return response.data;
  } catch (err) {
    console.warn('[gghost] Extension location fetch failed:', err);
    return null;
  }
}
window.gghost = window.gghost || {};
window.gghost.fetchLocationsByRadius = fetchLocationsByRadiusViaExtension;
const NOTE_QUEUE_KEY = 'gghost-note-queue';
const NOTE_QUEUE_MAX = 120;
let noteQueueFlushInFlight = false;
let noteQueueFlushScheduled = false;
function readNoteQueue() {
  try {
    const raw = localStorage.getItem(NOTE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}
function writeNoteQueue(queue) {
  try {
    if (!queue || !queue.length) {
      localStorage.removeItem(NOTE_QUEUE_KEY);
      return;
    }
    localStorage.setItem(NOTE_QUEUE_KEY, JSON.stringify(queue));
  } catch (_error) {
    // Ignore storage failures.
  }
}
function scheduleNoteQueueFlush(delayMs = 2000) {
  if (noteQueueFlushScheduled) return;
  noteQueueFlushScheduled = true;
  const run = () => {
    noteQueueFlushScheduled = false;
    void flushNoteQueue();
  };
  if (window.requestIdleCallback) {
    window.requestIdleCallback(run, { timeout: Math.max(delayMs, 2000) });
  } else {
    setTimeout(run, delayMs);
  }
}
function enqueueNotePayload(payload, reason) {
  if (!payload || typeof payload !== 'object') return;
  const queue = readNoteQueue();
  queue.push({
    payload,
    queuedAt: Date.now(),
    reason: reason ? String(reason) : null
  });
  if (queue.length > NOTE_QUEUE_MAX) {
    queue.splice(0, queue.length - NOTE_QUEUE_MAX);
  }
  writeNoteQueue(queue);
  scheduleNoteQueueFlush(6000);
}
async function flushNoteQueue() {
  if (noteQueueFlushInFlight) return;
  noteQueueFlushInFlight = true;
  try {
    const queue = readNoteQueue();
    if (!queue.length) return;
    const headers = getAuthHeaders();
    const remaining = [];
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      try {
        const res = await fetchViaBackground(NOTE_API, {
          method: "POST",
          headers,
          credentials: 'include',
          body: JSON.stringify(item.payload)
        });
        if (res?.ok) {
          continue;
        }
        const status = res?.status || 0;
        if (status === 401 || status === 403 || status >= 500 || status === 0) {
          remaining.push(...queue.slice(i));
          break;
        }
      } catch (_error) {
        remaining.push(...queue.slice(i));
        break;
      }
    }
    writeNoteQueue(remaining);
    if (remaining.length) {
      scheduleNoteQueueFlush(10000);
    }
  } finally {
    noteQueueFlushInFlight = false;
  }
}
window.gghost.flushNoteQueue = flushNoteQueue;
async function postToNoteAPI(payload) {
  if (shouldSkipNoteApi()) {
    return new Response('', { status: 204, statusText: 'Skipped note API on test host' });
  }
  console.log('[postToNoteAPI] Making authenticated API call with payload:', payload);
  const headers = getAuthHeaders();
  console.log('[postToNoteAPI] Using headers:', headers);
  try {
    const response = await fetchViaBackground(NOTE_API, {
      method: "POST",
      headers: headers,
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const status = response?.status || 0;
    console.log('[postToNoteAPI] Response status:', status);
    if (!response?.ok && (status >= 500 || status === 0)) {
      enqueueNotePayload(payload, `HTTP ${status || 'unknown'}`);
    } else if (response?.ok) {
      scheduleNoteQueueFlush(1500);
    }
    return response;
  } catch (err) {
    enqueueNotePayload(payload, err?.message || 'fetch failed');
    return new Response('', { status: 503, statusText: 'Note API fetch failed' });
  }
}
window.gghost.postToNoteAPI = postToNoteAPI;
scheduleNoteQueueFlush(4000);
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
  const url = withFirebaseAuth(`${baseURL}locationNotes/${uuid}/stats.json`);
  const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
  const r = await fetcher(url);
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
const STATS_WRITE_ENABLED = false;
const statsWriteInFlight = new Map();
const statsWriteOk = new Set();
function coerceStatTimestamp(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const parsed = Date.parse(String(value));
  if (!Number.isNaN(parsed)) return parsed;
  return null;
}
function buildStatKey(prefix, value) {
  const ts = coerceStatTimestamp(value);
  if (Number.isFinite(ts)) return `${prefix}${ts}`;
  const safe = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.#$/\[\]]/g, "_");
  if (!safe) return null;
  return `${prefix}${safe}`;
}
async function writeLocationStatEntry(uuid, key, payload) {
  if (!uuid || !key || !payload) return;
  if (!STATS_WRITE_ENABLED) return;
  if (firebaseWriteDisabled) return;
  const firebaseToken = getFirebaseAuthToken();
  if (!firebaseToken) {
    if (!firebaseWriteMissingTokenLogged) {
      console.warn("[Firebase] Skipping RTDB writes: missing auth token");
      firebaseWriteMissingTokenLogged = true;
    }
    return;
  }
  firebaseWriteMissingTokenLogged = false;
  const cacheKey = `${uuid}::${key}`;
  if (statsWriteOk.has(cacheKey)) return;
  if (statsWriteInFlight.has(cacheKey)) return statsWriteInFlight.get(cacheKey);
  const url = withFirebaseAuth(`${baseURL}locationNotes/${uuid}/stats/${key}.json`);
  const req = fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) disableFirebaseWrites(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }
    statsWriteOk.add(cacheKey);
  }).catch((err) => {
    console.warn("[YP] Stat write failed:", err);
  }).finally(() => {
    statsWriteInFlight.delete(cacheKey);
  });
  statsWriteInFlight.set(cacheKey, req);
  return req;
}
function getLocationUpdateDate(data) {
  if (!data || typeof data !== "object") return null;
  const dates = [
    data.updatedAt,
    data.updated_at,
    data.createdAt,
    data.created_at,
    data.Organization?.updatedAt,
    data.Organization?.updated_at,
    data.Organization?.createdAt,
    data.Organization?.created_at
  ];
  const address = data.PhysicalAddresses?.[0];
  if (address?.updatedAt) dates.push(address.updatedAt);
  if (address?.updated_at) dates.push(address.updated_at);
  if (address?.createdAt) dates.push(address.createdAt);
  if (address?.created_at) dates.push(address.created_at);
  const rawAddress = data.address || data.Address;
  if (rawAddress?.updatedAt) dates.push(rawAddress.updatedAt);
  if (rawAddress?.updated_at) dates.push(rawAddress.updated_at);
  if (rawAddress?.createdAt) dates.push(rawAddress.createdAt);
  if (rawAddress?.created_at) dates.push(rawAddress.created_at);
  const services = Array.isArray(data.Services)
    ? data.Services
    : (Array.isArray(data.services) ? data.services : []);
  services.forEach(service => {
    if (service?.updatedAt) dates.push(service.updatedAt);
    if (service?.updated_at) dates.push(service.updated_at);
    if (service?.createdAt) dates.push(service.createdAt);
    if (service?.created_at) dates.push(service.created_at);
  });
  return pickLatestDate(dates);
}
async function recordLocationStat(uuid, lastValidated, meta = {}) {
  if (!uuid || !lastValidated) return;
  const key = buildStatKey("v_", lastValidated);
  if (!key) return;
  const payload = { lastValidated, kind: "validation", ...meta };
  await writeLocationStatEntry(uuid, key, payload);
}
async function recordLocationUpdateStat(uuid, updatedAt, meta = {}) {
  if (!uuid || !updatedAt) return;
  const key = buildStatKey("u_", updatedAt);
  if (!key) return;
  const payload = { updatedAt, kind: "update", ...meta };
  await writeLocationStatEntry(uuid, key, payload);
}
async function recordLocationStatsFromPayload(uuid, data, meta = {}) {
  if (!uuid || !data || typeof data !== "object") return;
  const lastValidated = data.last_validated_at || data.lastValidated || null;
  const updatedAt = getLocationUpdateDate(data);
  if (lastValidated) await recordLocationStat(uuid, lastValidated, meta);
  if (updatedAt) await recordLocationUpdateStat(uuid, updatedAt, meta);
}
async function maybeRecordValidation(uuid, data) {
  try {
    await recordLocationStatsFromPayload(uuid, data, { source: "aws" });
  } catch (e) {
    console.warn("[YPButton] Could not record validation/update stats:", e);
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
  if (!uuid) {
    console.warn("[SiteVisit] fetchSiteVisitRecord called without a UUID");
    return null;
  }
  const url = withFirebaseAuth(`${baseURL}siteVisits/${uuid}.json`);
  const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
  try {
    const r = await fetcher(url, { cache: "no-store" });
    if (!r.ok) {
      console.warn(`[SiteVisit] Record fetch failed (${r.status}) for ${uuid}`);
      return null;
    }
    return await r.json(); // null if not present
  } catch (err) {
    console.warn("[SiteVisit] Record fetch threw, treating as no record:", err);
    return null;
  }
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
      const { accessToken, idToken, refreshToken, username } = getCognitoTokens();
      iframe.contentWindow.postMessage(
        { type: "CREDS", payload: { username, accessToken, idToken, refreshToken, nonce } },
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
  done = false
}) {
  if (!parentEl || typeof parentEl.prepend !== "function") {
    console.warn("[SiteVisit] Cannot render UI without a valid parent element");
    return;
  }
  parentEl.querySelector("#sitevisit-banner")?.remove();
  function buildVisitButtonRow() {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    const btn = document.createElement("button");
    btn.textContent = done ? `Thanks, ${userName || "team"}` : "Visit this location";
    Object.assign(btn.style, {
      padding: "6px 10px",
      border: "1px solid #000",
      borderRadius: "4px",
      background: "#fff",
      cursor: uuid ? "pointer" : "not-allowed",
      opacity: uuid ? "1" : "0.6"
    });
    if (uuid) {
      btn.addEventListener("click", () => {
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
    } else {
      btn.disabled = true;
      btn.title = "Location ID unavailable for this page";
    }
    row.appendChild(btn);
    return row;
  }
  function renderVisitButtonBanner() {
    const fallbackBanner = document.createElement("div");
    fallbackBanner.id = "sitevisit-banner";
    fallbackBanner.appendChild(buildVisitButtonRow());
    parentEl.prepend(fallbackBanner);
  }
  try {
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
    function formatUpdatedAt(value) {
      if (!value) return "recently";
      const dateObj = new Date(value);
      if (Number.isNaN(dateObj.getTime())) return value;
      try {
        return dateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "2-digit"
        });
      } catch {
        return value;
      }
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
      const updated = formatUpdatedAt(rec.meta.updatedAt);
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
              const url = withFirebaseAuth(`${baseURL}siteVisits/${uuid}/meta/done.json`);
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
      banner.appendChild(buildVisitButtonRow());
    }
    // Insert at the top of the read-only notes
    parentEl.prepend(banner);
  } catch (e) {
    console.warn('[SiteVisit] Skipping banner due to error:', e);
    renderVisitButtonBanner();
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
function decodeOrgNameFromDateKey(dateKey) {
  if (!dateKey) return "";
  try {
    const parts = String(dateKey).split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    return decodeURIComponent(last);
  } catch {
    return String(dateKey || "");
  }
}
function deriveAddressesFromFutureOrgKey(topKey) {
  if (!topKey) return [];
  try {
    const withoutSuffix = String(topKey).replace(/-futurenote$/i, "");
    const encodedSegment = withoutSuffix.split("_").slice(1).join(" ");
    if (!encodedSegment) return [];
    const decoded = decodeURIComponent(encodedSegment);
    return decoded
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
function formatFutureOrgNoteForTransfer({
  notePayload,
  fallbackNote,
  fallbackOrgName,
  fallbackUserKey,
  fallbackTopKey
}) {
  const sanitizedFallbackNote = (fallbackNote || "").trim();
  const fallbackAddresses = deriveAddressesFromFutureOrgKey(fallbackTopKey);
  if (notePayload && typeof notePayload === "object") {
    const lines = [];
    const body = typeof notePayload.note === "string" ? notePayload.note.trim() : "";
    const primaryLine = body && body !== "(no note)" ? body : "";
    if (primaryLine) lines.push(primaryLine);
    const detailParts = [];
    const orgName = (notePayload.orgName || fallbackOrgName || "").trim();
    if (orgName) detailParts.push(`Org: ${orgName}`);
    const contact = notePayload.contact || {};
    const phone = (contact.phoneRaw || contact.phone || "").trim();
    if (phone) detailParts.push(`Phone: ${phone}`);
    const email = (contact.email || "").trim();
    if (email) detailParts.push(`Email: ${email}`);
    const website = (contact.website || "").trim();
    if (website) detailParts.push(`Website: ${website}`);
    const addresses = Array.isArray(notePayload.addresses) && notePayload.addresses.length
      ? notePayload.addresses
      : fallbackAddresses;
    if (addresses.length) {
      detailParts.push(`Addresses: ${addresses.join(" | ")}`);
    }
    if (detailParts.length) {
      lines.push(detailParts.join(" | "));
    }
    lines.push("(moved from future/online leads)");
    return lines.filter(Boolean).join("\n");
  }
  const fallbackParts = [];
  if (sanitizedFallbackNote && sanitizedFallbackNote !== "(no note)") fallbackParts.push(sanitizedFallbackNote);
  if (fallbackOrgName) fallbackParts.push(`Org: ${fallbackOrgName}`);
  if (fallbackUserKey) fallbackParts.push(`Key: ${fallbackUserKey}`);
  if (fallbackAddresses.length) fallbackParts.push(`Addresses: ${fallbackAddresses.join(" | ")}`);
  fallbackParts.push("(moved from future/online leads)");
  return fallbackParts.filter(Boolean).join("\n");
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
async function transferFutureNoteToUUID({ orgKey, sourceUserName, sourceDate, noteText, NOTE_API, locationUuid, notePayload }) {
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
  const fallbackOrgName = decodeOrgNameFromDateKey(sourceDate);
  const readableUserKey = typeof fromFirebaseKey === "function" ? fromFirebaseKey(sourceUserName) : sourceUserName;
  const noteForLocation = formatFutureOrgNoteForTransfer({
    notePayload,
    fallbackNote: noteText,
    fallbackOrgName,
    fallbackUserKey: readableUserKey,
    fallbackTopKey: orgKey
  });
  await postToNoteAPI({
    uuid: locationUuid,
    userName: currentUser,
    date: today,
    note: noteForLocation
  }).then(r => checkResponse(r, "Transferring future/online note to UUID"));
  editableDiv.innerText = noteForLocation;
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
    resetFormState();
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
  let editingEntry = null;
  function parseFutureOrgNoteValue(noteVal) {
    if (!noteVal) return null;
    if (typeof noteVal === "object") {
      if (!noteVal) return null;
      if (!noteVal.type || noteVal.type === "futureOrg" || noteVal.orgName || noteVal.addresses) {
        return noteVal;
      }
      return null;
    }
    if (typeof noteVal !== "string") return null;
    try {
      const parsed = JSON.parse(noteVal);
      if (parsed && typeof parsed === "object") {
        if (!parsed.type || parsed.type === "futureOrg" || parsed.orgName || parsed.addresses) {
          return parsed;
        }
      }
    } catch {
      return null;
    }
    return null;
  }
  function getEntryAddresses(entry) {
    if (!entry) return [];
    const noteAddresses = Array.isArray(entry.noteData?.addresses)
      ? entry.noteData.addresses.filter(Boolean)
      : [];
    if (noteAddresses.length) return noteAddresses;
    return deriveAddressesFromFutureOrgKey(entry.topKey);
  }
  function getEntryContact(entry) {
    const contact = {
      website: "",
      email: "",
      phone: "",
      phoneDisplay: ""
    };
    if (!entry) return contact;
    const noteContact = entry.noteData?.contact || {};
    if (noteContact.website) contact.website = noteContact.website;
    if (noteContact.email) contact.email = noteContact.email;
    if (noteContact.phone) contact.phone = noteContact.phone;
    if (noteContact.phoneRaw) contact.phoneDisplay = noteContact.phoneRaw;
    if (!contact.phoneDisplay && contact.phone) contact.phoneDisplay = contact.phone;
    if (looksLikeCompositeKey(entry.userKey)) {
      const decoded = decodeCompositeKey(entry.userKey);
      if (!contact.website && decoded.website) contact.website = decoded.website;
      if (!contact.email && decoded.email) contact.email = decoded.email;
      if (!contact.phone && decoded.phone) contact.phone = decoded.phone;
      if (!contact.phoneDisplay && decoded.phone) contact.phoneDisplay = decoded.phone;
    }
    if (!contact.phoneDisplay && contact.phone) contact.phoneDisplay = contact.phone;
    return contact;
  }
  function getEntryOrgName(entry) {
    if (!entry) return "";
    if (entry.noteData?.orgName) return entry.noteData.orgName;
    return decodeOrgNameFromDateKey(entry.dateKey);
  }
  function formatTimestampForDisplay(ts) {
    if (!ts) return "";
    try {
      const date = new Date(ts);
      if (Number.isNaN(date.getTime())) return String(ts);
      return date.toLocaleString();
    } catch {
      return String(ts);
    }
  }
  function buildFutureOrgNotePayload({
    orgName,
    noteText,
    addressesList,
    website,
    email,
    phoneDigits,
    phoneRaw,
    actingUser,
    existing,
    compositeKey,
    targetKeys
  }) {
    const nowIso = new Date().toISOString();
    const metadata = {
      createdAt: existing?.metadata?.createdAt || nowIso,
      createdBy: existing?.metadata?.createdBy || actingUser,
      updatedAt: nowIso,
      updatedBy: actingUser
    };
    const contact = {};
    if (website) contact.website = website;
    if (email) contact.email = email;
    if (phoneDigits) contact.phone = phoneDigits;
    if (phoneRaw) contact.phoneRaw = phoneRaw;
    if (compositeKey) contact.compositeKey = compositeKey;
    const payload = {
      type: "futureOrg",
      version: 1,
      orgName,
      note: noteText || "(no note)",
      metadata
    };
    if (addressesList.length) payload.addresses = addressesList;
    if (Object.keys(contact).length) payload.contact = contact;
    if (targetKeys) payload.source = targetKeys;
    return payload;
  }
  const addresses = [];
  function renderAddresses() {
    addressList.innerHTML = '';
    addresses.forEach((addr, idx) => {
      const pill = document.createElement('div');
      pill.textContent = addr;
      Object.assign(pill.style, { padding: '4px 8px', border: '1px solid #000', borderRadius: '999px', background:'#fff', display:'inline-flex', alignItems:'center', gap:'8px' });
      const x = document.createElement('span');
      x.textContent = 'x';
      Object.assign(x.style, { cursor: 'pointer', fontWeight: 700 });
      x.onclick = () => { addresses.splice(idx,1); renderAddresses(); };
      pill.appendChild(x);
      addressList.appendChild(pill);
    });
  }
  function exitEditingMode() {
    editingEntry = null;
    saveBtn.textContent = "Save";
    saveBtn.removeAttribute("data-mode");
  }
  function resetFormState() {
    orgNameEl.value = "";
    phoneEl.value = "";
    websiteEl.value = "";
    emailEl.value = "";
    noteEl.value = "";
    addressInput.value = "";
    addresses.splice(0, addresses.length);
    renderAddresses();
    exitEditingMode();
  }
  function startEditing(entry) {
    editingEntry = {
      topKey: entry.topKey,
      userKey: entry.userKey,
      dateKey: entry.dateKey,
      noteData: entry.noteData
    };
    saveBtn.textContent = "Update";
    saveBtn.dataset.mode = "edit";
    const orgName = getEntryOrgName(entry);
    const contact = getEntryContact(entry);
    const editAddresses = getEntryAddresses(entry);
    orgNameEl.value = orgName || "";
    phoneEl.value = contact.phoneDisplay || "";
    websiteEl.value = contact.website || "";
    emailEl.value = contact.email || "";
    const noteValue = entry.noteData?.note || entry.displayNote || "";
    noteEl.value = noteValue === "(no note)" ? "" : noteValue;
    addresses.splice(0, addresses.length);
    addresses.push(...editAddresses);
    renderAddresses();
    addressInput.value = "";
    orgNameEl.focus();
  }
  addressAdd.onclick = () => {
    const v = addressInput.value.trim();
    if (!v) return;
    if (!addresses.includes(v)) {
      addresses.push(v);
      renderAddresses();
    }
    addressInput.value = '';
  };
  cancelBtn.onclick = () => {
    resetFormState();
    overlay.remove();
  };
async function saveFutureLead() {
  const orgName = orgNameEl.value.trim();
  const phoneRawInput = phoneEl.value.trim();
  const phoneDigits = getLast10Digits(phoneRawInput);
  const website = websiteEl.value.trim();
  const email = emailEl.value.trim();
  const noteText = noteEl.value.trim();
  const addrVal = addressInput.value.trim();
  if (addrVal && !addresses.includes(addrVal)) {
    addresses.push(addrVal);
    renderAddresses();
  }
  if (addrVal) {
    addressInput.value = "";
  }
  const sanitizedAddresses = addresses.map(addr => addr.trim()).filter(Boolean);
  if (!orgName) { alert("Organization name is required."); return; }
  if (!phoneDigits && !website && !email) { alert("Provide at least one of phone, website, or email."); return; }
  if (!validPhone(phoneRawInput))   { alert("Phone looks invalid."); return; }
  if (!validUrl(website))   { alert("Website must be a valid link."); return; }
  if (!validEmail(email))   { alert("Email looks invalid."); return; }
  const actingUser = userName || getCurrentUsername();
  const compositeKey = buildCompositeUuid(website, email, phoneDigits);
  const isEditing = !!editingEntry;
  const targetUuid = isEditing
    ? editingEntry.topKey
    : `${uuidv()}_${sanitizedAddresses.join(' | ')}-futureNote`;
  const targetUserKey = isEditing ? editingEntry.userKey : compositeKey;
  const targetDateKey = isEditing
    ? editingEntry.dateKey
    : `https://gogetta.nyc/team/location/${encodeURIComponent(orgName)}`;
  const notePayload = buildFutureOrgNotePayload({
    orgName,
    noteText,
    addressesList: sanitizedAddresses,
    website,
    email,
    phoneDigits,
    phoneRaw: phoneRawInput,
    actingUser,
    existing: editingEntry?.noteData,
    compositeKey,
    targetKeys: { uuid: targetUuid, userKey: targetUserKey, dateKey: targetDateKey }
  });
  const actionLabel = isEditing ? "Updating future/online org" : "Saving future/online org";
  const payload = {
    uuid: targetUuid,
    userName: targetUserKey,
    date: targetDateKey,
    note: JSON.stringify(notePayload)
  };
  try {
    const res = await postToNoteAPI(payload);
    await checkResponse(res, actionLabel);
    resetFormState();
    await loadExisting();
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
  existingDiv.innerHTML = "Loading...";
  try {
    const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    const r = await fetcher(withFirebaseAuth(`${baseURL}locationNotes.json`));
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    const all = await r.json() || {};
    const cards = [];
    for (const [topKey, userMap] of Object.entries(all)) {
      if (!userMap || typeof userMap !== "object") continue;
      const entries = [];
      for (const [userKey, dateMap] of Object.entries(userMap)) {
        if (!dateMap || typeof dateMap !== "object") continue;
        for (const [dateKey, noteVal] of Object.entries(dateMap)) {
          const noteData = parseFutureOrgNoteValue(noteVal);
          const isFuture =
            noteData?.type === "futureOrg" ||
            /-futurenote$/i.test(userKey) ||
            /-futurenote$/i.test(topKey) ||
            looksLikeCompositeKey(topKey) ||
            looksLikeCompositeKey(userKey);
          if (!isFuture) continue;
          const displayNote =
            noteData?.note ||
            (typeof noteVal === "string" ? noteVal : "");
          entries.push({
            topKey,
            userKey,
            dateKey,
            noteData,
            displayNote: displayNote || "(no note)",
            rawNote: noteVal
          });
        }
      }
      if (!entries.length) continue;
      const card = document.createElement("div");
      Object.assign(card.style, {
        border: "1px solid #ccc",
        borderRadius: "6px",
        background: "#fff",
        padding: "8px",
        marginBottom: "8px"
      });
      const title = document.createElement("div");
      title.style.fontWeight = "700";
      const nameFromNotes = entries.map(getEntryOrgName).find(Boolean);
      let fallbackTitle = "";
      const firstEntry = entries[0];
      if (firstEntry) {
        const candidate = firstEntry.dateKey || firstEntry.userKey || topKey;
        const decodedName = decodeOrgNameFromDateKey(firstEntry.dateKey);
        if (decodedName) {
          fallbackTitle = decodedName;
        } else {
          try {
            fallbackTitle = decodeURIComponent(candidate);
          } catch {
            fallbackTitle = candidate;
          }
        }
      }
      title.textContent = nameFromNotes || fallbackTitle || "(unknown org)";
      card.appendChild(title);
      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.color = "#555";
      const metaSource = entries.find(entry => entry.noteData) || entries[0];
      const metaContact = getEntryContact(metaSource);
      const metaAddresses = getEntryAddresses(metaSource);
      const websiteHtml = metaContact.website ? escapeHtml(metaContact.website) : "(none)";
      const emailHtml = metaContact.email ? escapeHtml(metaContact.email) : "(none)";
      const phoneDisplay = metaContact.phoneDisplay || "";
      const phoneHtml = phoneDisplay ? escapeHtml(phoneDisplay) : "(none)";
      const addressesHtml = metaAddresses.length
        ? metaAddresses.map(addr => escapeHtml(addr)).join("<br>")
        : "(none)";
      meta.innerHTML = `
        Website: ${websiteHtml}<br>
        Email: ${emailHtml}<br>
        Phone: ${phoneHtml}<br>
        Addresses: ${addressesHtml}
      `;
      card.appendChild(meta);
      const list = document.createElement("div");
      list.style.marginTop = "6px";
      entries.forEach(entry => {
        const row = document.createElement("div");
        row.style.borderTop = "1px dashed #eee";
        row.style.padding = "6px 0";
        const noteBlock = document.createElement("div");
        noteBlock.style.whiteSpace = "pre-wrap";
        noteBlock.style.marginTop = "4px";
        noteBlock.textContent = entry.noteData?.note || entry.displayNote || "(no note)";
        row.appendChild(noteBlock);
        const noteMeta = entry.noteData?.metadata;
        if (noteMeta && (noteMeta.updatedAt || noteMeta.updatedBy || noteMeta.createdAt || noteMeta.createdBy)) {
          const metaLine = document.createElement("div");
          metaLine.style.fontSize = "12px";
          metaLine.style.color = "#666";
          const parts = [];
          if (noteMeta.updatedAt) parts.push(`Updated: ${formatTimestampForDisplay(noteMeta.updatedAt)}`);
          if (noteMeta.updatedBy) parts.push(`By: ${noteMeta.updatedBy}`);
          if (!parts.length && noteMeta.createdAt) parts.push(`Created: ${formatTimestampForDisplay(noteMeta.createdAt)}`);
          if (!parts.length && noteMeta.createdBy) parts.push(`By: ${noteMeta.createdBy}`);
          if (parts.length) metaLine.textContent = parts.join(" | ");
          row.appendChild(metaLine);
        }
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
                noteText: entry.noteData?.note || entry.displayNote,
                NOTE_API,
                locationUuid: currentUuid,
                notePayload: entry.noteData
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
              noteText: entry.noteData?.note || entry.displayNote,
              NOTE_API,
              locationUuid: targetUuid,
              notePayload: entry.noteData
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
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.style.padding = "4px 6px";
        editBtn.addEventListener("click", () => {
          startEditing(entry);
        });
        actions.appendChild(editBtn);
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
const PAGE_LOCATION_CACHE_KEY = 'gghost-page-location-cache';
const PAGE_LOCATION_CACHE_TTL_MS = 2 * 60 * 1000;
const PAGE_LOCATION_CACHE_WAIT_MS = 1500;
const PAGE_LOCATION_CACHE_WAIT_INTERVAL_MS = 120;
function getCurrentPageLocationUuid() {
  const match = location.pathname.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,36})/i);
  return match ? match[1] : null;
}
function readPageLocationCacheEntry(uuid) {
  if (!uuid) return null;
  const pageUuid = getCurrentPageLocationUuid();
  if (!pageUuid || pageUuid.toLowerCase() !== uuid.toLowerCase()) return null;
  try {
    const raw = localStorage.getItem(PAGE_LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.uuid || String(parsed.uuid).toLowerCase() !== uuid.toLowerCase()) return null;
    const timestamp = Number(parsed.timestamp) || 0;
    const data = parsed.data;
    if (!data || typeof data !== 'object') return null;
    const dataId = String(data.id || '').toLowerCase();
    if (dataId && dataId !== uuid.toLowerCase()) return null;
    const isStale = !timestamp || Date.now() - timestamp > PAGE_LOCATION_CACHE_TTL_MS;
    return { data, timestamp, isStale };
  } catch (err) {
    console.warn('[LocationCache] Failed to read page cache', err);
    return null;
  }
}
function readPageLocationCache(uuid, { allowStale = false } = {}) {
  const entry = readPageLocationCacheEntry(uuid);
  if (!entry) return null;
  if (entry.isStale && !allowStale) {
    localStorage.removeItem(PAGE_LOCATION_CACHE_KEY);
    return null;
  }
  return entry.data;
}
async function waitForPageLocationCache(uuid, { timeoutMs = PAGE_LOCATION_CACHE_WAIT_MS, intervalMs = PAGE_LOCATION_CACHE_WAIT_INTERVAL_MS } = {}) {
  if (!uuid) return null;
  const normalized = String(uuid).toLowerCase();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pageUuid = getCurrentPageLocationUuid();
    if (!pageUuid || pageUuid.toLowerCase() !== normalized) return null;
    const data = readPageLocationCache(uuid);
    if (data) return data;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
const VISIT_HISTORY_STORAGE_KEY = 'gghost-location-visit-history';
const VISIT_HISTORY_LIMIT = 200;
const VISIT_HISTORY_DEDUP_MS = 30 * 1000;
function getLocationPageType(pathname) {
  const normalized = String(pathname || '').toLowerCase();
  if (normalized.includes('/services/')) return 'Service';
  if (normalized.includes('/questions/')) return 'Question';
  if (normalized.includes('/other-info')) return 'Other Info';
  if (normalized.includes('/recap')) return 'Recap';
  return 'Location';
}
function getLocationContextFromUrl(url) {
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = location.pathname || '';
  }
  const match = pathname.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,36})(?:\/([^?#]*))?/i);
  if (!match) return null;
  const uuid = match[1];
  const suffix = (match[2] || '').replace(/^\/+|\/+$/g, '');
  const fullPath = suffix ? `/team/location/${uuid}/${suffix}` : `/team/location/${uuid}`;
  return {
    uuid,
    fullPath,
    pageType: getLocationPageType(fullPath)
  };
}
function buildLocationDisplayName(details, uuid) {
  const org = String(details?.org || details?.orgName || '').trim();
  const name = String(details?.name || details?.locationName || '').trim();
  if (org && name && org.toLowerCase() !== name.toLowerCase()) {
    return `${org} - ${name}`;
  }
  return org || name || `Location ${uuid}`;
}
function readVisitHistory() {
  try {
    const raw = localStorage.getItem(VISIT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        uuid: entry?.uuid || '',
        fullPath: entry?.fullPath || '',
        pageType: entry?.pageType || getLocationPageType(entry?.fullPath || ''),
        visitedAt: Number(entry?.visitedAt) || 0
      }))
      .filter((entry) => entry.uuid && entry.visitedAt)
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, VISIT_HISTORY_LIMIT);
  } catch (err) {
    console.warn('[VisitHistory] Failed to read visit history', err);
    return [];
  }
}
function recordLocationVisit(context) {
  if (!context || !context.uuid || !context.fullPath) return;
  const now = Date.now();
  const entry = {
    uuid: context.uuid,
    fullPath: context.fullPath,
    pageType: context.pageType || getLocationPageType(context.fullPath),
    visitedAt: now
  };
  try {
    const history = readVisitHistory();
    const last = history[0];
    if (last
      && last.uuid === entry.uuid
      && last.fullPath === entry.fullPath
      && now - last.visitedAt < VISIT_HISTORY_DEDUP_MS
    ) {
      return;
    }
    const next = [entry, ...history];
    if (next.length > VISIT_HISTORY_LIMIT) {
      next.length = VISIT_HISTORY_LIMIT;
    }
    localStorage.setItem(VISIT_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[VisitHistory] Failed to record visit', err);
  }
}
let locationTitleRequestId = 0;
async function updateLocationTitleAndVisit(url = location.href) {
  const context = getLocationContextFromUrl(url);
  if (!context) return;
  recordLocationVisit(context);
  const requestId = ++locationTitleRequestId;
  const details = await fetchLocationDetails(context.uuid);
  if (requestId !== locationTitleRequestId) return;
  if (!details?.org && !details?.name) return;
  const displayName = buildLocationDisplayName(details, context.uuid);
  const suffix = context.pageType && context.pageType !== 'Location'
    ? ` - ${context.pageType}`
    : '';
  document.title = `${displayName}${suffix} | GoGetta`;
}
const LOCATION_DETAILS_CACHE_MS = 60 * 1000;
const locationDetailsCache = new Map();
const locationDetailsInFlight = new Map();
function buildEmptyLocationDetails() {
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
function buildLocationDetails(data, lastValidated) {
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
}
async function fetchLocationDetailsFromBackground(uuid, headers) {
  if (!chrome?.runtime?.sendMessage) return null;
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'FETCH_LOCATION_DETAILS', uuid, headers },
        (response) => {
          let lastError = null;
          try {
            lastError = chrome?.runtime?.lastError;
          } catch (err) {
            resolve({ ok: false, error: err?.message || String(err) });
            return;
          }
          if (lastError) {
            resolve({ ok: false, error: lastError.message || 'Extension error' });
            return;
          }
          resolve(response || { ok: false, error: 'No response' });
        }
      );
    } catch (err) {
      resolve({ ok: false, error: err?.message || String(err) });
    }
  });
}
async function fetchLocationDetails(uuid, { refresh = false } = {}) {
  if (!uuid) return buildEmptyLocationDetails();
  if (!refresh) {
    const cached = locationDetailsCache.get(uuid);
    if (cached && Date.now() - cached.timestamp < LOCATION_DETAILS_CACHE_MS) {
      return cached.data;
    }
    const inFlight = locationDetailsInFlight.get(uuid);
    if (inFlight) {
      return inFlight;
    }
  }
  if (!refresh) {
    const pageData = readPageLocationCache(uuid);
    if (pageData) {
      const lastValidated = pageData.last_validated_at || null;
      await recordLocationStatsFromPayload(uuid, pageData, { source: "page-cache" });
      const result = buildLocationDetails(pageData, lastValidated);
      locationDetailsCache.set(uuid, { data: result, timestamp: Date.now() });
      return result;
    }
    const pageUuid = getCurrentPageLocationUuid();
    if (pageUuid && pageUuid.toLowerCase() === uuid.toLowerCase()) {
      const awaited = await waitForPageLocationCache(uuid);
      if (awaited) {
        const lastValidated = awaited.last_validated_at || null;
        await recordLocationStatsFromPayload(uuid, awaited, { source: "page-cache-wait" });
        const result = buildLocationDetails(awaited, lastValidated);
        locationDetailsCache.set(uuid, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  }
  const request = (async () => {
    try {
      const headers = getAuthHeaders();
      void recordLocationInvocation(uuid, "fetchLocationDetails");
      let data = null;
      try {
        const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (err) {
        if (err && err.name === 'TypeError') {
          const fallback = await fetchLocationDetailsFromBackground(uuid, headers);
          if (fallback?.ok && fallback.data) {
            data = fallback.data;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      if (!data) throw new Error('No location data');
      const lastValidated = data.last_validated_at || null;
      await recordLocationStatsFromPayload(uuid, data, { source: "fetchLocationDetails" });
      return buildLocationDetails(data, lastValidated);
    } catch (err) {
      console.warn("Failed to fetch location:", err);
      const cached = locationDetailsCache.get(uuid);
      if (cached?.data) return cached.data;
      return buildEmptyLocationDetails();
    }
  })();
  if (!refresh) {
    locationDetailsInFlight.set(uuid, request);
  }
  let result;
  try {
    result = await request;
  } finally {
    if (!refresh) {
      locationDetailsInFlight.delete(uuid);
    }
  }
  const hasData = result.org || result.name || result.slug || result.address || result.services.length;
  if (!refresh && hasData) {
    locationDetailsCache.set(uuid, { data: result, timestamp: Date.now() });
  }
  return result;
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
// Function to check if current location has linked locations
async function hasLinkedLocations() {
  const fullServiceMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
  const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
  const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
  const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];
  if (!uuid) return false;
  try {
    const firebaseURL = withFirebaseAuth(`${baseURL}locationNotes/connections.json`);
    const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    const res = await fetcher(firebaseURL);
    if (!res.ok) return false;
    const allData = await res.json();
    const allGroups = allData || {};
    const relevantGroups = Object.entries(allGroups).filter(
      ([groupName, entry]) =>
        typeof entry === "object" &&
        entry[uuid] === true
    );
    return relevantGroups.length > 0;
  } catch (error) {
    console.error("[gghost.js] Error checking linked locations:", error);
    return false;
  }
}
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
      const hasLinks = await hasLinkedLocations();
      connectionButton.innerText = hasLinks ? "Show Other Branches" : "Link to other branches";
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
  const firebaseURL = withFirebaseAuth(`${baseURL}locationNotes/connections.json`);
  if (!userInput || typeof userInput !== 'string') return false;
  const sanitize = str => str.replace(/\s+/g, '').toLowerCase(); 
  const sanitizedInput = sanitize(userInput);
  try {
    const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    const res = await fetcher(firebaseURL);
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
  const firebaseURL = withFirebaseAuth(`${baseURL}locationNotes/connections.json`);
  console.log("[gghost.js] showConnectedLocations: Fetching connections from:", firebaseURL);
  let allData;
  try {
    const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    const res = await fetcher(firebaseURL);
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
  if (connectedUuid !== uuid && !connectedOrgName && !connectedLocName) {
    locationWrapper.remove();
    return;
  }
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
    locationDisplayElement.innerText = connectedLocName || connectedOrgName || "(Unavailable)";
  }
}).catch(err => {
  console.error(`[Traffic Light] Failed to fetch details for ${connectedUuid}:`, err);
  if (connectedUuid !== uuid) {
    locationWrapper.remove();
  } else {
    locationDisplayElement.innerText = "This location";
  }
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
  const locationNotesURL = withFirebaseAuth(`${baseURL}locationNotes/${currentPageUuid}.json`);
  try {
    const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    const res = await fetcher(locationNotesURL);
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
const urlChangeCallbacks = new Set();
let urlChangeObserverInstalled = false;
let lastUrlForChange = location.href;
function onUrlChange(callback) {
  if (typeof callback === 'function') {
    urlChangeCallbacks.add(callback);
  }
  if (urlChangeObserverInstalled) return;
  urlChangeObserverInstalled = true;
  const notifyIfChanged = () => {
    const currentUrl = location.href;
    if (currentUrl === lastUrlForChange) return;
    lastUrlForChange = currentUrl;
    urlChangeCallbacks.forEach((cb) => {
      try {
        cb(currentUrl);
      } catch (error) {
        if (error.message && error.message.includes('Extension context invalidated')) {
          console.warn('[gghost] Extension context invalidated, stopping URL monitoring');
          return;
        }
        console.error('[gghost] URL change callback error:', error);
      }
    });
  };
  new MutationObserver(() => {
    notifyIfChanged();
  }).observe(document, { subtree: true, childList: true });
  if (!window.__gghostHistoryWrapped) {
    window.__gghostHistoryWrapped = true;
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
  window.addEventListener('locationchange', notifyIfChanged);
  window.addEventListener('pushstate', notifyIfChanged);
  window.addEventListener('replacestate', notifyIfChanged);
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
function normalizeId(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}
function normalizeServices(services) {
  const list = coerceServicesArray(services).filter(service => {
    return service && typeof service === "object" && service.id;
  });
  const seen = new Set();
  return list.filter(service => {
    const id = normalizeId(service.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
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

